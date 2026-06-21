"""
MoodFit — Data Pipeline
data_pipeline.py

Prepares all 4 datasets for their respective roles:

  STAGE A — RoBERTa fine-tuning data (3 datasets merged):
    1. ArtEmis          → artwork descriptions + emotion labels
    2. PoetryFoundation → poem text + subject tags (mapped to emotions)
    3. GoEmotions       → short sentences + 27 emotion labels (mapped to 7)

  STAGE B — FAISS index building (1 dataset):
    4. DeepFashion (In-shop) → outfit images → CLIP embeddings → .index file

Run stages independently:
    python data_pipeline.py --stage roberta   # prepares training CSV
    python data_pipeline.py --stage faiss     # builds FAISS index
    python data_pipeline.py --stage all       # runs both
"""

import os
import json
import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from datasets import load_dataset
from sklearn.model_selection import train_test_split

logging.basicConfig(level=logging.INFO, format="%(asctime)s — %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------
OUTPUT_DIR       = Path(os.getenv("DATA_OUTPUT_DIR", "data"))
TRAIN_CSV        = OUTPUT_DIR / "roberta_train.csv"
VAL_CSV          = OUTPUT_DIR / "roberta_val.csv"
FAISS_INDEX_PATH = Path(os.getenv("FAISS_INDEX_PATH", "models/deepfashion.index"))
FAISS_META_PATH  = Path(os.getenv("FAISS_META_PATH",  "models/deepfashion_meta.json"))

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
FAISS_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Canonical emotion labels (7 classes RoBERTa will be trained to predict)
# ---------------------------------------------------------------------------
EMOTION_LABELS = ["melancholic", "joyful", "nostalgic", "energetic", "dark", "romantic", "calm"]
LABEL2ID = {label: i for i, label in enumerate(EMOTION_LABELS)}

# ---------------------------------------------------------------------------
# Mapping helpers — each dataset uses different label vocabularies.
# These dicts translate them into our 7 canonical emotions.
# ---------------------------------------------------------------------------

# ArtEmis has 9 emotions → map to our 7
ARTEMIS_MAP = {
    "sadness":      "melancholic",
    "fear":         "dark",
    "disgust":      "dark",
    "anger":        "dark",
    "amusement":    "joyful",
    "excitement":   "energetic",
    "contentment":  "calm",
    "awe":          "nostalgic",
    "something else": None,          # drop rows with this label
}

# GoEmotions has 27 emotions → map to our 7
# (unmapped emotions are dropped — keeps training data clean)
GOEMOTIONS_MAP = {
    "sadness":      "melancholic",
    "grief":        "melancholic",
    "disappointment": "melancholic",
    "remorse":      "melancholic",
    "joy":          "joyful",
    "amusement":    "joyful",
    "excitement":   "energetic",
    "admiration":   "nostalgic",
    "nostalgia":    "nostalgic",
    "love":         "romantic",
    "desire":       "romantic",
    "fear":         "dark",
    "anger":        "dark",
    "disgust":      "dark",
    "nervousness":  "dark",
    "relief":       "calm",
    "neutral":      "calm",
    "approval":     "calm",
    # all others → None (dropped)
}

# PoetryFoundation uses free-form subject tags → we map keywords to emotions
POETRY_KEYWORD_MAP = {
    "death":        "melancholic",
    "loss":         "melancholic",
    "grief":        "melancholic",
    "sorrow":       "melancholic",
    "love":         "romantic",
    "romance":      "romantic",
    "nature":       "calm",
    "peace":        "calm",
    "war":          "dark",
    "violence":     "dark",
    "dark":         "dark",
    "joy":          "joyful",
    "happiness":    "joyful",
    "memory":       "nostalgic",
    "childhood":    "nostalgic",
    "past":         "nostalgic",
    "energy":       "energetic",
    "passion":      "energetic",
}


def _map_poetry_tags(tags: str | list) -> str | None:
    """
    Given a poem's subject tags, return the first matching canonical emotion.
    Tags can be a comma-separated string or a list.
    Returns None if no keyword matches (row will be dropped).
    """
    if isinstance(tags, list):
        tag_str = " ".join(tags).lower()
    else:
        tag_str = str(tags).lower()

    for keyword, emotion in POETRY_KEYWORD_MAP.items():
        if keyword in tag_str:
            return emotion
    return None


# ===========================================================================
# STAGE A — Build RoBERTa fine-tuning dataset
# ===========================================================================

def load_artemis() -> pd.DataFrame:
    """
    ArtEmis: artwork descriptions paired with emotion labels.
    HuggingFace dataset: 'artemis-dataset/artemis'
    Relevant columns: utterance (text), emotion (label string)
    """
    logger.info("Loading ArtEmis …")
    ds = load_dataset("artemis-dataset/artemis", split="train", trust_remote_code=True)
    df = ds.to_pandas()[["utterance", "emotion"]].rename(columns={"utterance": "text"})

    df["label"] = df["emotion"].map(ARTEMIS_MAP)
    df = df.dropna(subset=["label"])
    df = df[["text", "label"]]
    df["source"] = "artemis"

    logger.info("ArtEmis: %d rows after cleaning", len(df))
    return df


def load_poetry_foundation() -> pd.DataFrame:
    """
    PoetryFoundation: poem text with subject/topic tags.
    HuggingFace dataset: 'sadickam/poem-topic-classification'
    Relevant columns: poem (text), topic (label string)
    """
    logger.info("Loading PoetryFoundation …")
    ds = load_dataset("sadickam/poem-topic-classification", split="train", trust_remote_code=True)
    df = ds.to_pandas()

    # Column names vary by version — normalise
    text_col  = "poem"  if "poem"  in df.columns else df.columns[0]
    label_col = "topic" if "topic" in df.columns else df.columns[1]
    df = df[[text_col, label_col]].rename(columns={text_col: "text", label_col: "tags"})

    df["label"] = df["tags"].apply(_map_poetry_tags)
    df = df.dropna(subset=["label"])
    df = df[["text", "label"]]
    df["source"] = "poetry"

    # Truncate very long poems to 512 tokens (rough word-count proxy)
    df["text"] = df["text"].apply(lambda x: " ".join(str(x).split()[:400]))

    logger.info("PoetryFoundation: %d rows after cleaning", len(df))
    return df


def load_goemotions() -> pd.DataFrame:
    """
    GoEmotions: short Reddit sentences with 27 fine-grained emotion labels.
    HuggingFace dataset: 'google-research-datasets/go_emotions' (simplified split)
    Relevant columns: text, labels (list of label indices)
    """
    logger.info("Loading GoEmotions …")
    ds = load_dataset("google-research-datasets/go_emotions", "simplified", split="train", trust_remote_code=True)
    df = ds.to_pandas()

    # 'labels' is a list of ints; the simplified split maps to 28 labels.
    # We take the first (highest-confidence) label per row.
    simplified_labels = [
        "admiration","amusement","anger","annoyance","approval","caring",
        "confusion","curiosity","desire","disappointment","disapproval",
        "disgust","embarrassment","excitement","fear","gratitude","grief",
        "joy","love","nervousness","optimism","pride","realization",
        "relief","remorse","sadness","surprise","neutral",
    ]

    def _first_label(label_ids: list) -> str | None:
        if not label_ids:
            return None
        name = simplified_labels[label_ids[0]]
        return GOEMOTIONS_MAP.get(name)

    df["label"] = df["labels"].apply(_first_label)
    df = df.dropna(subset=["label"])
    df = df[["text", "label"]]
    df["source"] = "goemotions"

    logger.info("GoEmotions: %d rows after cleaning", len(df))
    return df


def build_roberta_dataset() -> None:
    """
    Merge ArtEmis + PoetryFoundation + GoEmotions into a single balanced
    CSV that the RoBERTa fine-tuning script can load directly.

    Output columns: text | label | label_id | source
    """
    logger.info("=== STAGE A: Building RoBERTa training data ===")

    frames = [load_artemis(), load_poetry_foundation(), load_goemotions()]
    combined = pd.concat(frames, ignore_index=True)

    # Add numeric label id for HuggingFace Trainer
    combined["label_id"] = combined["label"].map(LABEL2ID)

    # Class balance report
    logger.info("Label distribution before balancing:\n%s", combined["label"].value_counts().to_string())

    # Undersample majority classes to 2× the minority class size
    min_count  = combined["label"].value_counts().min()
    target     = min(min_count * 2, 8000)          # cap at 8k per class
    balanced   = (
        combined
        .groupby("label", group_keys=False)
        .apply(lambda g: g.sample(min(len(g), target), random_state=42))
        .reset_index(drop=True)
    )

    logger.info("Label distribution after balancing:\n%s", balanced["label"].value_counts().to_string())

    # Train / val split (90 / 10)
    train_df, val_df = train_test_split(
        balanced, test_size=0.10, stratify=balanced["label"], random_state=42
    )

    train_df.to_csv(TRAIN_CSV, index=False)
    val_df.to_csv(VAL_CSV,   index=False)

    logger.info("Saved training set   → %s  (%d rows)", TRAIN_CSV, len(train_df))
    logger.info("Saved validation set → %s  (%d rows)", VAL_CSV,   len(val_df))


# ===========================================================================
# STAGE B — Build FAISS index from DeepFashion In-shop images
# ===========================================================================

def build_faiss_index_from_deepfashion() -> None:
    """
    Downloads the DeepFashion In-shop Clothes Retrieval dataset from
    HuggingFace, encodes every image with CLIP, and writes:
        models/deepfashion.index   — FAISS binary index
        models/deepfashion_meta.json — parallel metadata list

    Each metadata entry:
        {
            "outfit_id":  str (UUID),
            "image_url":  str (HuggingFace CDN URL),
            "style_tags": list[str]
        }
    """
    import uuid
    from PIL import Image
    from sentence_transformers import SentenceTransformer
    import faiss

    logger.info("=== STAGE B: Building FAISS index from DeepFashion ===")

    CLIP_MODEL = os.getenv("CLIP_MODEL_NAME", "clip-ViT-B-32")
    DEVICE     = "cuda" if __import__("torch").cuda.is_available() else "cpu"
    BATCH_SIZE = int(os.getenv("FAISS_BATCH_SIZE", "64"))

    logger.info("Loading DeepFashion In-shop dataset …")
    # HuggingFace dataset id for DeepFashion In-shop subset
    ds = load_dataset("detection-datasets/deepfashion_inshop", split="train", trust_remote_code=True)

    logger.info("Loading CLIP model: %s on %s …", CLIP_MODEL, DEVICE)
    clip = SentenceTransformer(CLIP_MODEL, device=DEVICE)

    vectors:  list[np.ndarray] = []
    metadata: list[dict]       = []

    logger.info("Encoding %d images in batches of %d …", len(ds), BATCH_SIZE)

    for start in range(0, len(ds), BATCH_SIZE):
        batch   = ds.select(range(start, min(start + BATCH_SIZE, len(ds))))
        images  = [
            img.convert("RGB").resize((224, 224))
            for img in batch["image"]
        ]

        vecs = clip.encode(
            images,
            convert_to_numpy=True,
            normalize_embeddings=True,
            batch_size=BATCH_SIZE,
            show_progress_bar=False,
        ).astype("float32")

        for i, row in enumerate(batch):
            vectors.append(vecs[i])
            # Extract style tags from category label if available
            category = str(row.get("label", "")).lower().replace("_", " ")
            tags     = [t.strip() for t in category.split()] if category else []

            metadata.append({
                "outfit_id":  str(uuid.uuid4()),
                "image_url":  row.get("image_url", f"deepfashion_{start + i}"),
                "style_tags": tags,
            })

        if (start // BATCH_SIZE) % 10 == 0:
            logger.info("  Encoded %d / %d images …", start + BATCH_SIZE, len(ds))

    # Stack all vectors and build FAISS flat L2 index
    matrix    = np.vstack(vectors)                   # (N, 512)
    dimension = matrix.shape[1]

    index = faiss.IndexFlatL2(dimension)
    index.add(matrix)
    faiss.write_index(index, str(FAISS_INDEX_PATH))
    logger.info("FAISS index saved → %s  (%d vectors)", FAISS_INDEX_PATH, index.ntotal)

    with open(FAISS_META_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info("Metadata saved → %s  (%d entries)", FAISS_META_PATH, len(metadata))


# ===========================================================================
# CLI entry point
# ===========================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MoodFit data pipeline")
    parser.add_argument(
        "--stage",
        choices=["roberta", "faiss", "all"],
        default="all",
        help=(
            "roberta → merge ArtEmis+Poetry+GoEmotions into training CSVs | "
            "faiss   → encode DeepFashion images and build FAISS index | "
            "all     → run both stages in order"
        ),
    )
    args = parser.parse_args()

    if args.stage in ("roberta", "all"):
        build_roberta_dataset()

    if args.stage in ("faiss", "all"):
        build_faiss_index_from_deepfashion()

    logger.info("Pipeline complete.")
