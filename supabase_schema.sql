-- Supabase Schema for MoodFit (Poetry-to-Outfit Aesthetic Retrieval System)
-- This file defines the PostgreSQL schemas, custom types, and extensions.

-- Enable pgvector extension for CLIP vector embedding search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL, -- Added for secure local backend auth
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: outfits (Global DeepFashion Dataset mapping)
CREATE TABLE IF NOT EXISTS outfits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_url TEXT NOT NULL, -- Public HTTP/Storage URL to DeepFashion images
    style_tags TEXT[] NOT NULL, -- e.g. ["dark academia", "minimalist"]
    dominant_color TEXT,
    faiss_index_position INTEGER UNIQUE NOT NULL, -- Map directly to FAISS row indexes
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: upload_batches (Wardrobe processing orchestration batches)
CREATE TABLE IF NOT EXISTS upload_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'ready' | 'failed'
    total_images INTEGER DEFAULT 0,
    items_extracted INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Table: wardrobe_items (Segmented user closet items with multi-dimension embedding)
CREATE TABLE IF NOT EXISTS wardrobe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES upload_batches(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    item_image_url TEXT,
    clip_vector VECTOR(512), -- unit-normalized 512-dimensional CLIP embedding
    category TEXT, -- e.g. 'top', 'bottom', 'dress', 'other'
    style_tags TEXT[],
    faiss_position INTEGER, -- position in current personal FAISS index
    indexed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_wardrobe_index (Index reference paths for personal indices)
CREATE TABLE IF NOT EXISTS user_wardrobe_index (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    index_path TEXT NOT NULL, -- path to personal.index inside Supabase Storage
    item_count INTEGER DEFAULT 0,
    last_rebuilt_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: searches (Combined search history log for real-time retrieving)
CREATE TABLE IF NOT EXISTS searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    input_text TEXT NOT NULL,
    dominant_emotion TEXT NOT NULL,
    emotion_vector JSONB NOT NULL, -- store probability distributions {melancholic: 0.8, ...}
    result_outfit_ids UUID[] NOT NULL, -- ordered matches from FAISS
    similarity_scores FLOAT[] NOT NULL, -- corresponding cosine similarities
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_searches_user_id ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_id ON wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_user_id ON upload_batches(user_id);
