"""
MoodFit — Wardrobe Pipeline
fastapi-backend/ml/wardrobe_pipeline.py

Handles:
  1. Image object-detection/segmentation (using torchvision FasterRCNN)
  2. CLIP embeddings encoding
  3. Personal FAISS flat index creation and storage updates
  4. LRU-cached index retrieval
  5. Asynchronous background multi-image wardrobe processing
  6. Re-ranking of search matches with a custom boost factor (0.05)
"""

import os
import uuid
import logging
import functools
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import numpy as np
import faiss
import torch
import requests
from PIL import Image

# For object detection
import torchvision
from torchvision.models.detection import FasterRCNN_ResNet50_FPN_Weights

logger = logging.getLogger(__name__)

# Cache size configuration
WARDROBE_INDEX_CACHE_SIZE = int(os.getenv("WARDROBE_INDEX_CACHE_SIZE", "50"))
PERSONAL_INDEX_BOOST      = float(os.getenv("PERSONAL_INDEX_BOOST", "0.05"))

# Dummy Supabase mock client imports for standalone compilation reference
# (in production, they represent standard client library endpoints)
try:
    from supabase import create_client, Client
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY", "")
    supabase_db: Optional[Client] = create_client(supabase_url, supabase_key) if (supabase_url and supabase_key) else None
except ImportError:
    supabase_db = None


# ---------------------------------------------------------------------------
# 1. Segment Clothing Items
# ---------------------------------------------------------------------------
_detector_model = None

def _get_detector():
    global _detector_model
    if _detector_model is None:
        logger.info("Initializing torchvision FasterRCNN model for clothing segmentation...")
        # Load weights on demand
        weights = FasterRCNN_ResNet50_FPN_Weights.DEFAULT
        _detector_model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=weights)
        _detector_model.eval()
    return _detector_model


def segment_clothing_items(image: Image.Image) -> List[Image.Image]:
    """
    Detect and crop individual clothing items from an uploaded photo.
    Uses torchvision's fasterrcnn_resnet50_fpn pre-trained on COCO.
    Filters detections to clothing-related COCO categories (backpack, tie, backpack, person torso, etc).
    If zero matches, returns [resized original to 224x224] as a safe fallback.
    """
    try:
        model = _get_get_detector() if hasattr(torchvision.models.detection, 'fasterrcnn_resnet50_fpn') else None
    except Exception as e:
        logger.warning("Could not initialize FasterRCNN: %s. Using fallback.", e)
        model = None

    # COCO clothing/accessory category IDs:
    # 27: backpack, 31: handbag, 32: tie, 33: suitcase
    CLOTHING_CATEGORIES = {27, 31, 32, 33}
    
    # Also if 'person' (category ID = 1) is found, we'll split the bounding box
    # to separate top torso (~upper 50%) and bottom legs (~lower 50%)
    
    original_size = image.size
    image_rgb = image.convert("RGB")
    
    if model is None:
        # Fallback direct resize
        return [image_rgb.resize((224, 224))]

    # Run through Faster RCNN
    transform = torchvision.transforms.Compose([torchvision.transforms.ToTensor()])
    img_tensor = transform(image_rgb).unsqueeze(0)
    
    with torch.no_grad():
        predictions = model(img_tensor)[0]
    
    boxes = predictions["boxes"].cpu().numpy()
    labels = predictions["labels"].cpu().numpy()
    scores = predictions["scores"].cpu().numpy()
    
    cropped_items: List[Image.Image] = []
    
    for box, label, score in zip(boxes, labels, scores):
        if score < 0.5:
            continue
            
        if label in CLOTHING_CATEGORIES:
            # Crop accessory/item bounding box
            x1, y1, x2, y2 = map(int, box)
            crop = image_rgb.crop((x1, y1, x2, y2))
            cropped_items.append(crop.resize((224, 224)))
            
        elif label == 1: # Person category
            # Heuristic subcheck: crop torso (top) and pants/skirts (bottom)
            x1, y1, x2, y2 = map(int, box)
            w = x2 - x1
            h = y2 - y1
            
            # Torso crop (~35% to 70% height)
            torso_y1 = int(y1 + 0.15 * h)
            torso_y2 = int(y1 + 0.55 * h)
            torso_crop = image_rgb.crop((x1, torso_y1, x2, torso_y2))
            cropped_items.append(torso_crop.resize((224, 224)))
            
            # Legs crop (~50% to 95% height)
            legs_y1 = int(y1 + 0.50 * h)
            legs_y2 = int(y1 + 0.95 * h)
            legs_crop = image_rgb.crop((x1, legs_y1, x2, legs_y2))
            cropped_items.append(legs_crop.resize((224, 224)))

    # Limit to maximum 5 items
    cropped_items = cropped_items[:5]
    
    # Fallback if nothing extracted
    if not cropped_items:
        cropped_items.append(image_rgb.resize((224, 224)))
        
    return cropped_items


# ---------------------------------------------------------------------------
# 2. CLIP Embeddings Encoder
# ---------------------------------------------------------------------------

def clip_encode_items(items: List[Image.Image], clip_model) -> np.ndarray:
    """
    Encode a list of cropped clothing items into unit-normalised 512-dim CLIP vectors.
    """
    vectors = clip_model.encode(
         items,
         convert_to_numpy=True,
         normalize_embeddings=True,
         show_progress_bar=False,
    ).astype("float32")
    return vectors


# ---------------------------------------------------------------------------
# 3. Personal Index Builder
# ---------------------------------------------------------------------------

def build_personal_faiss_index(user_id: str, vectors: np.ndarray) -> str:
    """
    Build a local FAISS flat index, write to a file, upload to Supabase Storage,
    and returns the public URL.
    """
    N, d = vectors.shape
    assert d == 512, "CLIP vector dimension must be 512"
    
    index = faiss.IndexFlatL2(d)
    index.add(vectors)
    
    # Save locally to temp folder
    local_path = Path(f"/tmp/{user_id}_personal.index")
    local_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(local_path))
    
    # Upload to Supabase Storage
    # Location: bucket "wardrobe-indexes" at path "{user_id}/personal.index"
    public_url = f"https://mock-supabase.storage/wardrobe-indexes/{user_id}/personal.index"
    
    if supabase_db is not None:
        try:
            with open(local_path, "rb") as f:
                supabase_db.storage.from_("wardrobe-indexes").upload(
                    path=f"{user_id}/personal.index",
                    file=f,
                    file_options={"cache-control": "3600", "x-upsert": "true"}
                )
            public_url = supabase_db.storage.from_("wardrobe-indexes").get_public_url(f"{user_id}/personal.index")
        except Exception as e:
            logger.error("Failed uploading personal index to Supabase storage: %s", e)
            
    # Upsert index registry
    if supabase_db is not None:
        try:
            supabase_db.table("user_wardrobe_index").upsert({
                "user_id": user_id,
                "index_path": f"{user_id}/personal.index",
                "item_count": N,
                "last_rebuilt_at": "now()"
            }).execute()
        except Exception as e:
            logger.error("Failed updating user_wardrobe_index table: %s", e)

    return public_url


# ---------------------------------------------------------------------------
# 4. LRU Cached Personal Index Loader
# ---------------------------------------------------------------------------

@functools.lru_cache(maxsize=WARDROBE_INDEX_CACHE_SIZE)
def _retrieve_cached_index(user_id: str) -> Optional[Tuple[faiss.Index, List[Dict[str, Any]]]]:
    """
    Internal cached fetch: downloads index file, reads it, and loads all parallel
    database item records ordered strictly by faiss_position to map FAISS search hits.
    """
    local_path = Path(f"/tmp/{user_id}_personal.index")
    metadata_list: List[Dict[str, Any]] = []

    # If Supabase is connected
    if supabase_db is not None:
        try:
            # Check user wardrobe index entry
            reg_res = supabase_db.table("user_wardrobe_index").select("*").eq("user_id", user_id).execute()
            if not reg_res.data:
                return None
                
            # Download file
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_path, "wb") as f:
                res = supabase_db.storage.from_("wardrobe-indexes").download(f"{user_id}/personal.index")
                f.write(res)
                
            # Fetch catalog items ordered by FAISS position
            items_res = supabase_db.table("wardrobe_items").select("*").eq("user_id", user_id).eq("indexed", True).order("faiss_position").execute()
            metadata_list = items_res.data
            
        except Exception as e:
            logger.error("Error retrieving personal index for user %s: %s", user_id, e)
            return None
    else:
        # Mock offline return
        if not local_path.exists():
            return None

    # Load FAISS
    try:
        index = faiss.read_index(str(local_path))
        return index, metadata_list
    except Exception as e:
        logger.error("Error building FAISS index object: %s", e)
        return None


def load_personal_index(user_id: str) -> Optional[Tuple[faiss.Index, List[Dict[str, Any]]]]:
    """
    Public method to resolve user index (returns Tuple of index + metadata catalogue list).
    """
    return _retrieve_cached_index(user_id)


# ---------------------------------------------------------------------------
# 5. Process Wardrobe Batch Background Task
# ---------------------------------------------------------------------------

def process_wardrobe_batch(batch_id: str, user_id: str, image_urls: List[str]) -> None:
    """
    Orchestrates the entire async flow for a wardrobe batch:
      1. Downloads crop items, segments clothes, runs CLIP encoders.
      2. Uploads crops to Supabase and saves database item logs.
      3. Compiles all historical items' vectors, rebuilds FAISS, uploads to cloud storage.
      4. Closes batch status.
    """
    logger.info("Initializing background wardrobe batch %s processing...", batch_id)
    
    # Lazy imports to avoid cyclic dependencies
    from ml.inference import _clip_model
    
    if _clip_model is None:
        logger.warning("CLIP model not loaded, cannot run batch processing.")
        _update_batch_status(batch_id, "failed", error="Core models not initialized on server.")
        return

    extracted_items_data: List[dict] = []
    
    try:
        for idx, url in enumerate(image_urls):
            # A. Download raw image
            res = requests.get(url, timeout=15)
            if res.status_code != 200:
                raise Exception(f"Failed downloading image {url}: status {res.status_code}")
                
            tmp_img = Image.open(torch.io.BytesIO(res.content))
            
            # B. Segment clothes
            crops = segment_clothing_items(tmp_img)
            
            # C. Encode clothes
            vectors = clip_encode_items(crops, _clip_model)
            
            # D. Save crops and write DB items
            for c_idx, (crop, vector) in enumerate(zip(crops, vectors)):
                item_id = str(uuid.uuid4())
                crop_local_path = Path(f"/tmp/{item_id}.jpg")
                crop.save(crop_local_path, "JPEG", quality=90)
                
                # Upload crop
                crop_uploaded_url = f"https://mock-supabase.storage/wardrobe-items/{user_id}/{item_id}.jpg"
                if supabase_db is not None:
                    with open(crop_local_path, "rb") as f:
                        supabase_db.storage.from_("wardrobe-items").upload(
                            path=f"{user_id}/{item_id}.jpg",
                            file=f,
                            file_options={"content-type": "image/jpeg"}
                        )
                    crop_uploaded_url = supabase_db.storage.from_("wardrobe-items").get_public_url(f"{user_id}/{item_id}.jpg")
                
                db_payload = {
                    "id": item_id,
                    "user_id": user_id,
                    "batch_id": batch_id,
                    "original_url": url,
                    "item_image_url": crop_uploaded_url,
                    "clip_vector": vector.tolist(), # PGVector representation list
                    "category": "other", # categorizations could be expanded
                    "style_tags": ["wardrobe", "personal"],
                    "indexed": False
                }
                extracted_items_data.append(db_payload)

        # Upload wardrobe items to DB
        if supabase_db is not None and extracted_items_data:
            supabase_db.table("wardrobe_items").insert(extracted_items_data).execute()

        # Re-fetch ALL available clip vectors for the user to rebuild unified index
        all_user_items = []
        if supabase_db is not None:
            all_items_res = supabase_db.table("wardrobe_items").select("*").eq("user_id", user_id).execute()
            all_user_items = all_items_res.data
        
        if not all_user_items:
            raise Exception("No active wardrobe items found in DB to index.")
            
        # Parse arrays back to numpy vectors
        vectors_list = [np.array(item["clip_vector"], dtype="float32") for item in all_user_items]
        combined_matrix = np.vstack(vectors_list)
        
        # Build index and upload path
        index_url = build_personal_faiss_index(user_id, combined_matrix)
        
        # Assign faiss_position mapping sequentially back to database
        if supabase_db is not None:
            for position, item in enumerate(all_user_items):
                supabase_db.table("wardrobe_items").update({
                    "faiss_position": position,
                    "indexed": True
                }).eq("id", item["id"]).execute()
                
        # Clear local LRU cache to force refreshing loaded version
        _retrieve_cached_index.cache_clear()
        
        # Update batch completion
        _update_batch_status(
            batch_id, 
            status="ready", 
            items_extracted=len(extracted_items_data)
        )
        logger.info("Successfully completed wardrobe batch %s processing.", batch_id)

    except Exception as e:
        logger.error("Error processing wardrobe batch %s: %s", batch_id, e)
        _update_batch_status(batch_id, status="failed", error=str(e))
        raise e


def _update_batch_status(batch_id: str, status: str, items_extracted: int = 0, error: str = None):
    """Utility callback helper to database batch status"""
    if supabase_db is not None:
        try:
            payload = {
                "status": status,
                "items_extracted": items_extracted,
                "completed_at": "now()" if status in ("ready", "failed") else None
            }
            if error:
                payload["error_message"] = error
            supabase_db.table("upload_batches").update(payload).eq("id", batch_id).execute()
        except Exception as ex:
            logger.error("DB update error on batch status: %s", ex)


# ---------------------------------------------------------------------------
# 6. Re-rank Search Matches (with Personal Wardrobe Prioritization Boost)
# ---------------------------------------------------------------------------

def merge_search_results(personal_results: List[Any], global_results: List[Any], top_k: int = 5) -> List[Any]:
    """
    Reranks unified matches. Adds a source-boost of +0.05 to user items.
    """
    combined: List[Any] = []
    
    for r in personal_results:
        # Clone matching class to avoid affecting DB types
        r.source = "wardrobe"
        combined.append(r)
        
    for g in global_results:
        g.source = "deepfashion"
        combined.append(g)

    # Sort key: prioritize personal wardrobe if score is within PERSONAL_INDEX_BOOST
    # We apply: customized_score = similarity_score + (PERSONAL_INDEX_BOOST if source == "wardrobe" else 0.0)
    def ranking_key(match):
        boostVal = PERSONAL_INDEX_BOOST if match.source == "wardrobe" else 0.0
        return (match.similarity_score + boostVal, match.similarity_score)

    combined_sorted = sorted(combined, key=ranking_key, reverse=True)
    return combined_sorted[:top_k]
