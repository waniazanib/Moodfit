"""
MoodFit — ML Inference Module
fastapi-backend/ml/inference.py

Loads two models on startup:
  1. RoBERTa fine-tuned emotion extractor  (ArtEmis + PoetryFoundation)
  2. CLIP text embedder                    (openai/clip-vit-base-patch32)

Then performs FAISS nearest-neighbour search over the pre-indexed
DeepFashion outfit image embeddings, combined with any custom user
wardrobe FAISS index if a user_id is provided.
"""

import os
import re
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict

import numpy as np
import faiss
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sentence_transformers import SentenceTransformer

# Absolute imports within fastapi-backend space
from ml.wardrobe_pipeline import load_personal_index, merge_search_results

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
EMOTION_LABELS: List[str] = [
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
    emotions: Dict[str, float]          # {emotion_label: probability}
    dominant_emotion: str
    mood_summary: str
    confidence: float


@dataclass
class OutfitMatch:
    outfit_id: str                      # UUID stored in FAISS metadata or item_id
    image_url: str
    similarity_score: float             # cosine similarity ∈ [0, 1]
    style_tags: List[str] = field(default_factory=list)
    source: str = "deepfashion"         # "wardrobe" | "deepfashion"


@dataclass
class PredictionResult:
    emotion: EmotionResult
    results: List[OutfitMatch]


# ---------------------------------------------------------------------------
# Module-level singletons — loaded once at FastAPI startup
# ---------------------------------------------------------------------------

_roberta_tokenizer: Optional[AutoTokenizer]                         = None
_roberta_model:     Optional[AutoModelForSequenceClassification]    = None
_clip_model:        Optional[SentenceTransformer]                   = None
_faiss_index:       Optional[faiss.Index]                           = None
_faiss_meta:        Optional[List[dict]]                            = None   # list of {outfit_id, image_url, style_tags}


def load_models() -> None:
    """
    Call this once inside FastAPI's lifespan startup handler.
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
         normalize_embeddings=True,
    ).astype("float32")

    return vector


def _search_index(index: faiss.Index, query_vector: np.ndarray, k: int = TOP_K, source: str = "deepfashion", metadata_list: Optional[List[dict]] = None) -> List[OutfitMatch]:
    """
    Utility to search a specific index (either user personal index or global).
    """
    query_2d = query_vector.reshape(1, -1)
    distances, indices = index.search(query_2d, k)

    matches: List[OutfitMatch] = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx == -1:
            continue
        
        similarity = float(round(1.0 - dist / 2.0, 4))
        
        # Resolve metadata
        if source == "deepfashion" and _faiss_meta:
            meta = _faiss_meta[idx]
            matches.append(OutfitMatch(
                outfit_id        = meta["outfit_id"],
                image_url        = meta["image_url"],
                similarity_score = similarity,
                style_tags       = meta.get("style_tags", []),
                source           = "deepfashion"
            ))
        elif source == "wardrobe" and metadata_list:
            meta = metadata_list[idx]
            matches.append(OutfitMatch(
                outfit_id        = meta["id"],
                image_url        = meta["item_image_url"],
                similarity_score = similarity,
                style_tags       = meta.get("style_tags", []),
                source           = "wardrobe"
            ))

    return matches


# ---------------------------------------------------------------------------
# Public API — called by FastAPI route handler
# ---------------------------------------------------------------------------

def predict(raw_text: str, user_id: Optional[str] = None) -> PredictionResult:
    """
    End-to-end inference pipeline. Handles global and personal search with re-ranking.
    """
    # 1. Sanitise
    clean_text = _sanitize(raw_text)
    if len(clean_text.split()) < 3:
        raise ValueError("Input must be at least 3 words.")

    # 2. Emotion extraction
    emotion_result = _extract_emotions(clean_text)

    # 3. CLIP embedding
    query_vector = _embed_mood(emotion_result.mood_summary)

    # 4. Search and Retrieval
    # Search global DeepFashion outfits
    global_results = _search_index(_faiss_index, query_vector, k=TOP_K, source="deepfashion")

    # Search user's personal wardrobe if logged in and index exists
    if user_id:
        personal_index_data = load_personal_index(user_id)
        if personal_index_data:
            personal_idx, metadata_list = personal_index_data
            personal_results = _search_index(
                personal_idx, 
                query_vector, 
                k=TOP_K, 
                source="wardrobe", 
                metadata_list=metadata_list
            )
        else:
            personal_results = []
        
        # Merge, re-rank with 0.05 score boost for user's own items
        results = merge_search_results(personal_results, global_results, top_k=TOP_K)
    else:
        results = global_results

    return PredictionResult(
        emotion=emotion_result,
        results=results,
    )
