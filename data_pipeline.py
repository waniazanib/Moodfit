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
import glob
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
    "anger":         "dark",
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
    "anger":         "dark",
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
    Loads local CSV files from the datasets/artemis folder.
    """
    logger.info("Loading local ArtEmis CSV files …")
    
    # 1. Grab all CSV files inside your artemis folder
    # Note: Using python raw strings `R"..."` avoids any backslash escaping issues
    csv_pattern = R"D:\ANN\Projects\MoodFit\datasets\artemis\*.csv"
    csv_files = glob.glob(csv_pattern)
    
    if not csv_files:
        raise ValueError(f"No CSV files found in: {csv_pattern}. Check your folder structure!")

    # 2. Read and concatenate all matching CSV files
    logger.info("Found CSV files: %s", csv_files)
    dfs = [pd.read_csv(f) for f in csv_files]
    df = pd.concat(dfs, ignore_index=True)

    # 3. Clean and restructure
    df = df[["utterance", "emotion"]].rename(columns={"utterance": "text"})
    df["label"] = df["emotion"].map(ARTEMIS_MAP)
    df = df.dropna(subset=["label"])
    df = df[["text", "label"]]
    df["source"] = "artemis"

    logger.info("ArtEmis: %d rows after cleaning", len(df))
    return df

def load_poetry_foundation() -> pd.DataFrame:
    """
    Loads 'poetry' dataset. Prefers local files, e.g. poetry_foundation.csv or poem_sentiment.csv,
    then falls back to various official/stable HuggingFace poem/poetry datasets.
    """
    logger.info("Loading Poetry / Poem dataset …")
    
    # 1. Search for local files first
    local_paths = [
        Path(R"D:\ANN\Projects\MoodFit\datasets\poetry_foundation.csv"),
        Path(R"D:\ANN\Projects\MoodFit\datasets\poem_sentiment.csv"),
        Path("datasets/poetry_foundation.csv"),
        Path("datasets/poem_sentiment.csv"),
        Path("poetry_foundation.csv"),
    ]
    
    # Also search recursively under datasets/ for any csv file with poem or poetry in the name
    datasets_dir = Path("datasets")
    if datasets_dir.exists():
        for p in datasets_dir.rglob("*.csv"):
            name = p.name.lower()
            if "poetry" in name or "poem" in name:
                local_paths.insert(0, p)
                
    local_file = None
    for p in local_paths:
        if p.exists():
            local_file = p
            break
            
    if local_file:
        logger.info("Found local Poetry CSV file: %s", local_file)
        try:
            df = pd.read_csv(local_file)
            # Map columns
            text_col = "verse_text" if "verse_text" in df.columns else ("poem" if "poem" in df.columns else ("text" if "text" in df.columns else df.columns[0]))
            df = df.rename(columns={text_col: "text"})
            
            # Map labels/tags
            if "label" in df.columns:
                # Keep it as is or map if it is numeric
                pass
            elif "tags" in df.columns:
                df["label"] = df["tags"].apply(_map_poetry_tags)
            elif "topic" in df.columns:
                df["label"] = df["topic"].apply(_map_poetry_tags)
            else:
                df["label"] = "calm"
                
            df = df.dropna(subset=["label"])
            df = df[["text", "label"]]
            df["source"] = "poetry"
            logger.info("Local Poetry: %d rows loaded", len(df))
            return df
        except Exception as e:
            logger.warning("Error loading local Poetry CSV %s: %s. Falling back to HuggingFace.", local_file, str(e))

    # 2. HuggingFace fallback
    df = None
    try:
        logger.info("Attempting to load 'poem_sentiment' from Hugging Face …")
        ds = load_dataset("poem_sentiment", split="train")
        df = ds.to_pandas()
        if "verse_text" in df.columns:
            df = df.rename(columns={"verse_text": "text"})
            
        def _map_sentiment_to_emotion(row) -> str | None:
            text = str(row.get("text", "")).lower()
            lbl = row.get("label", -1)
            if lbl == 0:
                dark_keywords = ["dark", "death", "pain", "fear", "ghost", "shadow", "doom", "grave", "kill", "blood", "night", "hate", "sin", "ghosts", "haunt"]
                if any(kw in text for kw in dark_keywords): return "dark"
                return "melancholic"
            elif lbl == 1:
                romantic_keywords = ["love", "heart", "kiss", "beauty", "romantic", "fair", "sweet", "darling", "spouse"]
                if any(kw in text for kw in romantic_keywords): return "romantic"
                energetic_keywords = ["wild", "song", "wind", "run", "bound", "energy", "life", "burn", "gold", "sun", "fire", "bold"]
                if any(kw in text for kw in energetic_keywords): return "energetic"
                return "joyful"
            elif lbl == 2:
                nostalgic_keywords = ["old", "remember", "past", "yesterday", "years", "youth", "childhood", "memory", "spent", "forgot", "ancient"]
                if any(kw in text for kw in nostalgic_keywords): return "nostalgic"
                return "calm"
            elif lbl == 3:
                return "nostalgic"
            return None
        df["label"] = df.apply(_map_sentiment_to_emotion, axis=1)
    except Exception as e1:
        logger.warning("Could not load poem_sentiment from Hugging Face: %s. Trying 'sadickam/poem-topic-classification' fallback …", str(e1))
        try:
            ds = load_dataset("sadickam/poem-topic-classification", split="train", trust_remote_code=True)
            df = ds.to_pandas()
            text_col = "poem" if "poem" in df.columns else df.columns[0]
            label_col = "topic" if "topic" in df.columns else df.columns[1]
            df = df[[text_col, label_col]].rename(columns={text_col: "text", label_col: "tags"})
            df["label"] = df["tags"].apply(_map_poetry_tags)
        except Exception as e2:
            logger.warning("Could not load secondary HF dataset: %s. Returning fallback dummy/empty dataset.", str(e2))
            
    if df is not None:
        df = df.dropna(subset=["label"])
        df = df[["text", "label"]]
        df["source"] = "poetry"
        logger.info("Poetry dataset: %d rows loaded from HuggingFace", len(df))
        return df

    return pd.DataFrame(columns=["text", "label", "source"])


def load_goemotions() -> pd.DataFrame:
    """
    GoEmotions: Reddit sentences with emotion labels.
    Prefers local CSV in 'datasets/goemotions/go_emotions.csv' or similar,
    falling back to HuggingFace 'google-research-datasets/go_emotions'.
    """
    logger.info("Loading GoEmotions …")
    
    local_paths = [
        Path("D:\ANN\Projects\MoodFit\datasets\go_emotions\go_emotions_dataset.csv"),
    ]
    # Search recursively for goemotions CSV file
    for f in Path("datasets").rglob("*.csv") if Path("datasets").exists() else []:
        if "goemotions" in f.name.lower() or "go_emotions" in f.name.lower():
            if f not in local_paths:
                local_paths.insert(0, f)

    local_file = None
    for p in local_paths:
        if p.exists():
            local_file = p
            break

    if local_file:
        logger.info("Found local GoEmotions file: %s", local_file)
        df = pd.read_csv(local_file)
    else:
        logger.info("Local GoEmotions file not found. Falling back to HuggingFace 'google-research-datasets/go_emotions' …")
        try:
            ds = load_dataset("google-research-datasets/go_emotions", "simplified", split="train", trust_remote_code=True)
            df = ds.to_pandas()
        except Exception as e:
            logger.warning("Could not load GoEmotions from HuggingFace: %s. Returning empty fallback.", str(e))
            return pd.DataFrame(columns=["text", "label", "source"])

    # Standard labels for mapping/decoding
    simplified_labels = [
        "admiration","amusement","anger","annoyance","approval","caring",
        "confusion","curiosity","desire","disappointment","disapproval",
        "disgust","embarrassment","excitement","fear","gratitude","grief",
        "joy","love","nervousness","optimism","pride","realization",
        "relief","remorse","sadness","surprise","neutral",
    ]

    # Flexible label processing depending on column type
    if "label" in df.columns or "emotion" in df.columns or "category" in df.columns:
        label_col = "label" if "label" in df.columns else ("emotion" if "emotion" in df.columns else "category")
        if df[label_col].dtype == object:
            df["label"] = df[label_col].apply(lambda x: GOEMOTIONS_MAP.get(str(x).strip().lower()))
        else:
            def _map_int_lbl(idx):
                try:
                    name = simplified_labels[int(idx)]
                    return GOEMOTIONS_MAP.get(name)
                except Exception:
                    return None
            df["label"] = df[label_col].apply(_map_int_lbl)
            
    elif "labels" in df.columns:
        def _first_label(label_ids):
            if isinstance(label_ids, (list, np.ndarray)) and label_ids:
                try:
                    name = simplified_labels[int(label_ids[0])]
                    return GOEMOTIONS_MAP.get(name)
                except Exception:
                    pass
            elif isinstance(label_ids, str):
                parts = [p.strip() for p in label_ids.split(",") if p.strip()]
                if parts:
                    try:
                        name = simplified_labels[int(parts[0])]
                        return GOEMOTIONS_MAP.get(name)
                    except Exception:
                        return GOEMOTIONS_MAP.get(parts[0].lower())
            return None
        df["label"] = df["labels"].apply(_first_label)
        
    else:
        # Check if the dataset is multi-hot encoded (with column headers for each emotion)
        found_emotion_cols = [c for c in df.columns if c in simplified_labels]
        if found_emotion_cols:
            logger.info("Parsing multi-hot encoded local GoEmotions CSV with %d emotion columns", len(found_emotion_cols))
            def _from_multi_hot(row):
                for col in found_emotion_cols:
                    if int(row[col]) == 1:
                        return GOEMOTIONS_MAP.get(col)
                return None
            df["label"] = df.apply(_from_multi_hot, axis=1)
        else:
            text_col = "text" if "text" in df.columns else df.columns[0]
            label_col = df.columns[1]
            df["label"] = df[label_col].apply(lambda x: GOEMOTIONS_MAP.get(str(x).strip().lower()))

    # Finalise columns
    text_col = "text" if "text" in df.columns else df.columns[0]
    df = df.rename(columns={text_col: "text"})
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
    
    samples = []
    for label_val, group in combined.groupby("label"):
        samples.append(group.sample(min(len(group), target), random_state=42))
    balanced = pd.concat(samples, ignore_index=True)

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
    Downloads or maps local DeepFashion In-shop Clothes Retrieval dataset,
    encodes every image with CLIP, and writes:
        models/deepfashion.index   — FAISS binary index
        models/deepfashion_meta.json — parallel metadata list

    Each metadata entry:
        {
            "outfit_id":  str (UUID),
            "image_url":  str (Local file path or HuggingFace CDN URL),
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

    # Helper to find local folder
    def find_local_deepfashion_dir() -> Path | None:
        search_dirs = [
            Path(R"D:\ANN\Projects\MoodFit\datasets\deep_fashion\image_high-res"),
            Path(R"D:\ANN\Projects\MoodFit\datasets\deepfashion_inshop\img_highres"),
            Path(R"D:\ANN\Projects\MoodFit\datasets\deepfashion\image_high-res"),
            Path(R"D:\ANN\Projects\MoodFit\datasets\image_high-res"),
            Path("datasets/deep_fashion/image_high-res"),
            Path("datasets/deep_fashion_in_shop/image_high-res"),
            Path("datasets/deepfashion/image_high-res"),
            Path("datasets/image_high-res"),
            Path("image_high-res"),
        ]
        for p in search_dirs:
            if p.exists() and p.is_dir():
                return p
        
        # Search recursively inside 'datasets' or workspace for 'image_high-res'
        for root_dir in [Path("datasets"), Path(".")]:
            if root_dir.exists():
                for p in root_dir.rglob("image_high-res"):
                    if p.is_dir():
                        return p
                        
        # Check Windows default absolute path recursively
        win_root = Path(R"D:\ANN\Projects\MoodFit\datasets")
        if win_root.exists():
            for p in win_root.rglob("image_high-res"):
                if p.is_dir():
                    return p
        return None

    local_dir = find_local_deepfashion_dir()
    vectors:  list[np.ndarray] = []
    metadata: list[dict]       = []

    logger.info("Loading CLIP model: %s on %s …", CLIP_MODEL, DEVICE)
    clip = SentenceTransformer(CLIP_MODEL, device=DEVICE)

    if local_dir:
        logger.info("Found local DeepFashion directory at %s. Processing local photos...", local_dir)
        # Scan for images
        image_extensions = ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]
        img_paths = []
        for ext in image_extensions:
            img_paths.extend(list(local_dir.rglob(ext)))

        logger.info("Found %d local dataset images to encode.", len(img_paths))
        if len(img_paths) == 0:
            logger.error("No images found under '%s'. Cannot build local index.", local_dir)
            return

        # Encode in batches
        for start in range(0, len(img_paths), BATCH_SIZE):
            batch_paths = img_paths[start : start + BATCH_SIZE]
            images = []
            for path in batch_paths:
                try:
                    img = Image.open(path).convert("RGB").resize((224, 224))
                    images.append(img)
                except Exception as e:
                    logger.warning("Skipping corrupted or unreadable image %s: %s", path, str(e))

            if not images:
                continue

            vecs = clip.encode(
                images,
                convert_to_numpy=True,
                normalize_embeddings=True,
                batch_size=len(images),
                show_progress_bar=False,
            ).astype("float32")

            for i, path in enumerate(batch_paths):
                if i >= len(vecs):
                    break
                vectors.append(vecs[i])
                
                # Derive style tags from relative path parts (excluding file name)
                # e.g., if pure_rel is men/Cardigans/img_0001.jpg, parts will be ['men', 'cardigans']
                pure_rel = path.relative_to(local_dir)
                parts = [p.lower() for p in pure_rel.parts[:-1]]
                
                tags = []
                for part in parts:
                    words = [w.strip() for w in part.replace("_", " ").replace("-", " ").split() if w.strip()]
                    tags.extend(words)

                metadata.append({
                    "outfit_id":  str(uuid.uuid4()),
                    "image_url":  str(path.as_posix()),  # Relative local path
                    "style_tags": tags,
                })

            if (start // BATCH_SIZE) % 10 == 0:
                logger.info("  Encoded %d / %d images …", min(start + BATCH_SIZE, len(img_paths)), len(img_paths))

    else:
        logger.info("Local DeepFashion folder not found. Falling back to HuggingFace 'detection-datasets/deepfashion_inshop' …")
        ds = load_dataset("detection-datasets/deepfashion_inshop", split="train", trust_remote_code=True)
        logger.info("Encoding %d HuggingFace images in batches of %d …", len(ds), BATCH_SIZE)

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
    if not vectors:
        logger.error("No vectors were encoded. FAISS index not created.")
        return

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
