"""
MoodFit — ML Inference Module
ml/inference.py

Loads two models on startup:
  1. RoBERTa fine-tuned emotion extractor  (ArtEmis + PoetryFoundation)
  2. CLIP text embedder                    (openai/clip-vit-base-patch32)

Then performs FAISS nearest-neighbour search over the pre-indexed
DeepFashion outfit image embeddings.

Attach this file to your Google AI Studio prompt so the generated
FastAPI backend wires its routes directly around these function signatures.
"""

import os
import re
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import faiss
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config (all values pulled from environment / .env via python-dotenv)
# ---------------------------------------------------------------------------

ROBERTA_MODEL_PATH: str = os.getenv("ROBERTA_MODEL_PATH", "models/roberta-artemis")
CLIP_MODEL_NAME: str    = os.getenv("CLIP_MODEL_NAME",    "clip-ViT-B-32")
FAISS_INDEX_PATH: str   = os.getenv("FAISS_INDEX_PATH",   "models/deepfashion.index")
FAISS_META_PATH: str    = os.getenv("FAISS_META_PATH",    "models/deepfashion_meta.json")

DEVICE: str = "cuda" if torch.cuda.is_available() else "cpu"

# Emotion labels — must match the label order used during RoBERTa fine-tuning
EMOTION_LABELS: list[str] = [
    "melancholic",
    "joyful",
    "nostalgic",
    "energetic",
    "dark",
    "romantic",
    "calm",
]

# Minimum acceptable confidence for the dominant emotion.
# Below this threshold the input is considered too ambiguous.
CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.40"))

# How many outfit results to return
TOP_K: int = int(os.getenv("TOP_K", "5"))


# ---------------------------------------------------------------------------
# Data classes (mirrors the Pydantic response schema in FastAPI)
# ---------------------------------------------------------------------------

@dataclass
class EmotionResult:
    emotions: dict[str, float]          # {emotion_label: probability}
    dominant_emotion: str
    mood_summary: str
    confidence: float


@dataclass
class OutfitMatch:
    outfit_id: str                       # UUID stored in FAISS metadata
    image_url: str
    similarity_score: float              # cosine similarity ∈ [0, 1]
    style_tags: list[str] = field(default_factory=list)


@dataclass
class PredictionResult:
    emotion: EmotionResult
    results: list[OutfitMatch]


# ---------------------------------------------------------------------------
# Module-level singletons — loaded once at FastAPI startup
# ---------------------------------------------------------------------------

_roberta_tokenizer: Optional[AutoTokenizer]                         = None
_roberta_model:     Optional[AutoModelForSequenceClassification]    = None
_clip_model:        Optional[SentenceTransformer]                   = None
_faiss_index:       Optional[faiss.Index]                           = None
_faiss_meta:        Optional[list[dict]]                            = None   # list of {outfit_id, image_url, style_tags}


def load_models() -> None:
    """
    Call this once inside FastAPI's lifespan startup handler:

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            load_models()
            yield

    Loads all heavy artefacts into module-level singletons so every
    request reuses the same in-memory objects.
    """
    global _roberta_tokenizer, _roberta_model, _clip_model, _faiss_index, _faiss_meta

    logger.info("Loading RoBERTa emotion model from %s …", ROBERTA_MODEL_PATH)
    _roberta_tokenizer = AutoTokenizer.from_pretrained(ROBERTA_MODEL_PATH)
    _roberta_model     = AutoModelForSequenceClassification.from_pretrained(
        ROBERTA_MODEL_PATH,
        num_labels=len(EMOTION_LABELS),
    ).to(DEVICE)
    _roberta_model.eval()

    logger.info("Loading CLIP model: %s …", CLIP_MODEL_NAME)
    _clip_model = SentenceTransformer(CLIP_MODEL_NAME, device=DEVICE)

    logger.info("Loading FAISS index from %s …", FAISS_INDEX_PATH)
    _faiss_index = faiss.read_index(FAISS_INDEX_PATH)

    logger.info("Loading FAISS metadata from %s …", FAISS_META_PATH)
    with open(FAISS_META_PATH, "r", encoding="utf-8") as f:
        _faiss_meta = json.load(f)  # list[{outfit_id, image_url, style_tags}]

    logger.info(
        "All models loaded. FAISS index contains %d vectors.",
        _faiss_index.ntotal,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _sanitize(text: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_emotions(text: str) -> EmotionResult:
    """
    Run RoBERTa over the input text.
    Returns a probability distribution across EMOTION_LABELS plus a
    one-sentence mood summary built from the top-2 emotions.

    Raises ValueError if the dominant emotion confidence < CONFIDENCE_THRESHOLD.
    """
    assert _roberta_tokenizer and _roberta_model, "Models not loaded. Call load_models() first."

    inputs = _roberta_tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True,
    ).to(DEVICE)

    with torch.no_grad():
        logits = _roberta_model(**inputs).logits          # shape: (1, num_labels)

    probs: np.ndarray = F.softmax(logits, dim=-1).cpu().numpy()[0]   # (num_labels,)

    emotion_dict = {label: float(round(p, 4)) for label, p in zip(EMOTION_LABELS, probs)}

    sorted_emotions = sorted(emotion_dict.items(), key=lambda x: x[1], reverse=True)
    dominant_emotion, dominant_prob = sorted_emotions[0]
    second_emotion, _               = sorted_emotions[1]

    if dominant_prob < CONFIDENCE_THRESHOLD:
        raise ValueError(
            f"Text too ambiguous for emotion extraction "
            f"(confidence {dominant_prob:.2f} < threshold {CONFIDENCE_THRESHOLD})"
        )

    mood_summary = (
        f"A {dominant_emotion} and {second_emotion} aesthetic, "
        f"evoking feelings of {dominant_emotion} depth."
    )

    return EmotionResult(
        emotions=emotion_dict,
        dominant_emotion=dominant_emotion,
        mood_summary=mood_summary,
        confidence=dominant_prob,
    )


def _embed_mood(mood_summary: str) -> np.ndarray:
    """
    Encode the mood summary string with CLIP.
    Returns a normalised float32 vector of shape (512,).
    """
    assert _clip_model, "CLIP model not loaded. Call load_models() first."

    vector: np.ndarray = _clip_model.encode(
        mood_summary,
        convert_to_numpy=True,
        normalize_embeddings=True,   # unit-normalised → cosine similarity == dot product
    ).astype("float32")

    return vector


def _search_outfits(query_vector: np.ndarray, k: int = TOP_K) -> list[OutfitMatch]:
    """
    Query the FAISS index with a single (512,) normalised vector.
    Returns up to k OutfitMatch objects ordered by descending similarity.

    FAISS stores L2 distances; because both query and index vectors are
    unit-normalised, distance = 2(1 - cosine_similarity), so:
        cosine_similarity = 1 - distance / 2
    """
    assert _faiss_index and _faiss_meta, "FAISS index not loaded. Call load_models() first."

    query_2d = query_vector.reshape(1, -1)                      # FAISS expects (n, d)
    distances, indices = _faiss_index.search(query_2d, k)       # each shape: (1, k)

    matches: list[OutfitMatch] = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx == -1:                                           # FAISS returns -1 for empty slots
            continue
        meta        = _faiss_meta[idx]
        similarity  = float(round(1.0 - dist / 2.0, 4))        # convert L2 → cosine

        matches.append(OutfitMatch(
            outfit_id       = meta["outfit_id"],
            image_url       = meta["image_url"],
            similarity_score= similarity,
            style_tags      = meta.get("style_tags", []),
        ))

    return matches


# ---------------------------------------------------------------------------
# Public API — called by FastAPI route handler
# ---------------------------------------------------------------------------

def predict(raw_text: str) -> PredictionResult:
    """
    End-to-end inference pipeline.

    Parameters
    ----------
    raw_text : str
        Raw user input — poem, mood phrase, or lyric.
        Must be between 3 words and 512 tokens after sanitisation.

    Returns
    -------
    PredictionResult
        Contains the full emotion breakdown and top-k outfit matches.

    Raises
    ------
    ValueError
        If the dominant emotion confidence is below CONFIDENCE_THRESHOLD.
        FastAPI should catch this and return HTTP 422.
    """
    # 1. Sanitise
    clean_text = _sanitize(raw_text)
    if len(clean_text.split()) < 3:
        raise ValueError("Input must be at least 3 words.")

    # 2. Emotion extraction
    emotion_result = _extract_emotions(clean_text)

    # 3. CLIP embedding on the generated mood summary
    query_vector = _embed_mood(emotion_result.mood_summary)

    # 4. FAISS retrieval
    outfit_matches = _search_outfits(query_vector, k=TOP_K)

    return PredictionResult(
        emotion=emotion_result,
        results=outfit_matches,
    )


# ---------------------------------------------------------------------------
# Utility: build the FAISS index from scratch (run once offline)
# ---------------------------------------------------------------------------

def build_faiss_index(
    image_paths: list[str],
    outfit_metadata: list[dict],
    output_index_path: str = FAISS_INDEX_PATH,
    output_meta_path: str  = FAISS_META_PATH,
) -> None:
    """
    Offline utility — run this once to create the FAISS index from
    your DeepFashion image dataset before starting the server.

    Parameters
    ----------
    image_paths : list[str]
        Absolute paths to the outfit images (must be pre-downloaded).
    outfit_metadata : list[dict]
        Parallel list of dicts: [{outfit_id, image_url, style_tags}, ...].
        Must have the same length and order as image_paths.
    output_index_path : str
        Where to write the .index file.
    output_meta_path : str
        Where to write the JSON metadata file.

    Example
    -------
    >>> from ml.inference import build_faiss_index
    >>> build_faiss_index(image_paths=[...], outfit_metadata=[...])
    """
    from PIL import Image
    from sentence_transformers import SentenceTransformer as ST

    assert len(image_paths) == len(outfit_metadata), \
        "image_paths and outfit_metadata must have equal length."

    logger.info("Building FAISS index for %d images …", len(image_paths))

    clip = ST(CLIP_MODEL_NAME, device=DEVICE)

    vectors: list[np.ndarray] = []
    for path in image_paths:
        img = Image.open(path).convert("RGB").resize((224, 224))
        vec = clip.encode(img, convert_to_numpy=True, normalize_embeddings=True)
        vectors.append(vec.astype("float32"))

    matrix = np.vstack(vectors)                         # (N, 512)
    dimension = matrix.shape[1]

    index = faiss.IndexFlatL2(dimension)                # exact L2 search
    index.add(matrix)
    faiss.write_index(index, output_index_path)
    logger.info("FAISS index saved → %s  (%d vectors)", output_index_path, index.ntotal)

    with open(output_meta_path, "w", encoding="utf-8") as f:
        json.dump(outfit_metadata, f, indent=2)
    logger.info("Metadata saved → %s", output_meta_path)
