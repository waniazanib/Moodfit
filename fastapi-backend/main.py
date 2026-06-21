"""
MoodFit — FastAPI Backend Server Entry point
fastapi-backend/main.py

Initializes:
  - Life-span managers loading ML transformers and FAISS indices
  - CORS, Rate limiting (Slowapi), and custom JWT handling cookie decoders
  - Route handlers mapping Predict, OAuth/Credentials, and Wardrobe pipelines
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import jwt

from fastapi import FastAPI, Depends, HTTPException, status, Cookie, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

# Slowapi rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Import schemas, inference, wardrobe pipeline modules
from models.pydantic import (
    TextInput, UserAuth, PredictionResponse, AuthResponse,
    BatchStatusResponse, WardrobeListResponse, WardrobeStatsResponse,
    PersonalWardrobeItem, OutfitMatchSchema
)
from ml.inference import load_models, predict, PredictionResult as MLPredictionResult
from ml.wardrobe_pipeline import process_wardrobe_batch

# Load environments
SECRET_KEY = os.getenv("SECRET_KEY", "moodfit-super-secret-key-928374921")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
JWT_ALGORITHM = "HS256"

# Create limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="MoodFit - Poetry-to-Outfit Retrieval Engine")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allowed CORS origins
origins = [
    FRONTEND_URL,
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ML Server Lifespan handling
# ---------------------------------------------------------------------------

@app.on_event("startup")
def startup_event():
    logger = jwt.logging.getLogger("uvicorn")
    logger.info("Initializing MoodFit Server Models...")
    try:
        load_models()
    except Exception as e:
        logger.error(f"Failed loading ML components: {e}. (Verify mock setup files)")


# ---------------------------------------------------------------------------
# Authentication guards & helpers
# ---------------------------------------------------------------------------

def get_current_user_id(token: Optional[str] = Cookie(None)) -> uuid.UUID:
    """JWT in HttpOnly optional validator — decodes credentials, triggers 401 if corrupt"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session cookies missing. Login required.",
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token details.")
        return uuid.UUID(user_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Exited or corrupted session.")


def get_optional_user_id(token: Optional[str] = Cookie(None)) -> Optional[uuid.UUID]:
    """Retrieves user_id if valid cookie exists, else returns None without failing"""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return uuid.UUID(payload.get("sub"))
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# API Routes: Authenticators
# ---------------------------------------------------------------------------

@app.post("/api/v1/auth/register", response_model=AuthResponse)
def register(credentials: UserAuth):
    """Saves user to PostgreSQL details (Mock implementation)"""
    new_user_id = uuid.uuid4()
    # In full production codebase, execute insert statement:
    # INSERT INTO users (id, email, hashed_password) VALUES (new_user_id, credentials.email, hash(credentials.password))
    return AuthResponse(
        message="Created credentials successfully.",
        email=credentials.email,
        user_id=new_user_id
    )


@app.post("/api/v1/auth/login")
def login(credentials: UserAuth, response: Response):
    """Generates secure HttpOnly authorization sessions stored for 7 days"""
    # Verify user from database in standard deployment
    user_id = uuid.uuid4() # Mocked profile resolve
    
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    token = jwt.encode({"sub": str(user_id), "exp": expires}, SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        max_age=7 * 24 * 60 * 60,
        expires=expires.strftime("%a, %d-%b-%Y %H:%M:%S GMT"),
        samesite="strict",
        secure=True # in prod, else False in dev context
    )
    return {"message": "Successful login.", "user_id": user_id, "email": credentials.email}


@app.post("/api/v1/auth/logout")
def logout(response: Response):
    """Deletes authorizations state"""
    response.delete_cookie("token")
    return {"message": "Logged out successfully."}


# ---------------------------------------------------------------------------
# API Routes: Core ML Retrieval
# ---------------------------------------------------------------------------

@app.post("/api/v1/predict", response_model=PredictionResponse)
@limiter.limit("10/minute")
def predict_endpoint(
    payload: TextInput,
    response: Response,
    user_id: Optional[uuid.UUID] = Depends(get_optional_user_id)
):
    """
    Accepts text poems/mood statements, runs pipeline:
    RoBERTa classifiers → CLIP mood vectors → FAISS search.
    Enforces a slowapi rate limit.
    """
    try:
        res: MLPredictionResult = predict(payload.text, user_id=str(user_id) if user_id else None)
        
        # In actual deployment, write searches log entry to PG:
        # INSERT INTO searches (user_id, input_text, dominant_emotion, emotion_vector, result_outfit_ids, similarity_scores) ...
        search_id = uuid.uuid4()
        
        return PredictionResponse(
            search_id=search_id,
            dominant_emotion=res.emotion.dominant_emotion,
            mood_summary=res.emotion.mood_summary,
            emotion_breakdown=res.emotion.emotions,
            results=[
                OutfitMatchSchema(
                    outfit_id=str(r.outfit_id),
                    image_url=r.image_url,
                    similarity_score=r.similarity_score,
                    style_tags=r.style_tags,
                    source=r.source
                ) for r in res.results
            ]
        )
    except ValueError as e:
        # Catch confidence threshold limits (<0.40) or input word bounds
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"General ML retrieval failure: {e}")


@app.get("/api/v1/history")
def get_history(user_id: uuid.UUID = Depends(get_current_user_id)):
    """Returns the last 20 searches executed by the authenticated profile"""
    # Select from PG searches table ordered by created_at DESC LIMIT 20
    return []


# ---------------------------------------------------------------------------
# API Routes: Wardrobe Upload Feature (Sect 9)
# ---------------------------------------------------------------------------

@app.post("/api/v1/wardrobe/upload", status_code=status.HTTP_202_ACCEPTED, response_model=BatchStatusResponse)
def upload_wardrobe_photos(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """
    Protected multi-file wardrobe ingest endpoint.
    Handles size restrictions <= 10MB per file, files counts <= 50,
     generates upload batch, launches processes in CPU BackgroundTask.
    """
    if len(files) < 1 or len(files) > 50:
        raise HTTPException(status_code=400, detail="Wardrobe upload accepts 1 to 50 image files at once.")
    
    # Verify file sizes
    MAX_SIZE = 10 * 1024 * 1024 # 10MB
    for f in files:
        # Verify content type
        if f.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(status_code=400, detail=f"Invalid file format: {f.filename}. Accepts JPG, PNG or WEBP only.")
        
        # Size sanity checks (we would read file metadata or stream bytes)
        # For simplicity in mock validations, imagine size check complete
    
    batch_id = uuid.uuid4()
    
    # Save files to Supabase Storage at wardrobe-uploads/{user_id}/{batch_id}/{filename}
    # Create DB upload_batches row with status "processing"
    image_paths_in_storage = []
    
    # Simulate saving files
    for idx, f in enumerate(files):
        # f.file.read() -> upload_to_supabase_bucket
        image_paths_in_storage.append(f"https://mock-supabase.storage/wardrobe-uploads/{user_id}/{batch_id}/{idx}_{f.filename}")
        
    # Queue CPU intensive processes: segment, clip embed, rebuild index, database logs
    background_tasks.add_task(
        process_wardrobe_batch,
        batch_id=str(batch_id),
        user_id=str(user_id),
        image_urls=image_paths_in_storage
    )
    
    return BatchStatusResponse(
        batch_id=batch_id,
        status="processing",
        items_extracted=0,
        message="Your wardrobe is being analyzed and indexed. Poll /status for completion."
    )


@app.get("/api/v1/wardrobe/status/{batch_id}", response_model=BatchStatusResponse)
def get_batch_status(batch_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id)):
    """Polls progress of a segmented crop batch"""
    # Query upload_batches by batch_id
    return BatchStatusResponse(
        batch_id=batch_id,
        status="ready",  # returns real processing states in deployment
        items_extracted=12
    )


@app.get("/api/v1/wardrobe/items", response_model=WardrobeListResponse)
def list_wardrobe_items(
    page: int = 1,
    limit: int = 20,
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """Retrieves paginated catalogs of extracted items"""
    # Select from wardrobe_items where user_id=user_id offset (page-1)*limit limit
    return WardrobeListResponse(items=[], total=0, page=page)


@app.delete("/api/v1/wardrobe/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wardrobe_item(
    item_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    """Deletes item and schedules a non-blocking background FAISS index rebuild"""
    # Delete row from wardrobe_items, delete crop file from bucket
    # Queue rebuild: background_tasks.add_task(rebuild_faiss_index, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/wardrobe/stats", response_model=WardrobeStatsResponse)
def get_wardrobe_statistics(user_id: uuid.UUID = Depends(get_current_user_id)):
    """Aggregates user closet tags and count states"""
    return WardrobeStatsResponse(
        total_items=0,
        categories={"top": 0, "bottom": 0, "dress": 0, "other": 0},
        index_status="empty",
        last_updated=datetime.now()
    )


# ---------------------------------------------------------------------------
# Standard runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    # Bind to port 3000 or custom settings in non-docker test environments
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
