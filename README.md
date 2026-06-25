# MoodFit — Poetry-to-Outfit Aesthetic Alignment Retrieval System

MoodFit is a multi-modal semantic search index application designed to align written prose, poems, or song lyrics directly with corresponding individual apparel items or complete outfits. It parses emotional cues through a custom-trained RoBERTa model, maps this tone into a unified CLIP embedding space, and queries FAISS nearest-neighbor indexes.

---

## 🏗️ Tech Stack
- **Frontend**: Next.js 14 App Router, Tailwind CSS, Zod Form validation, React Hook Form, Framer Motion
- **Inference Server**: FastAPI, Torch, HuggingFace transformers, Sentence-Transformers, FAISS-CPU, Torchvision FasterRCNN
- **Database / Storage**: Supabase (PostgreSQL with `pgvector` enabled), Supabase bucket object storage namespaces.

---

## 📂 Project Navigation Structure
```
├── fastapi-backend/
│   ├── main.py                    # FastAPI bootstrap entrypoint
│   ├── models/
│   │   └── pydantic.py            # Pydantic schema mappings
│   ├── ml/
│   │   ├── inference.py           # Core double-model pipeline loader & querier
│   │   └── wardrobe_pipeline.py   # Clothes segmentations, cache indices compiler
│   └── Dockerfile
├── next-frontend/
│   ├── app/
│   │   ├── layout.tsx             # Fonts bindings
│   │   ├── page.tsx               # Primary retrieval prompt view
│   │   └── wardrobe/
│   │       └── page.tsx           # Personal closet drag/drop index refinery
│   ├── components/
│   │   ├── HistorySidebar.tsx
│   │   ├── PredictForm.tsx
│   │   └── ResultsGrid.tsx
│   ├── utils/
│   │   ├── api.ts                 # client side fetch wrappers
│   │   └── schemas.ts             # Zod form validators
│   └── Dockerfile
├── data_pipeline.py               # Pre-training CSV compiler & FAISS index builder
├── train_roberta.md               # HuggingFace multi-class training specifications
├── supabase_schema.sql            # Postgres migration tables definition
├── docker-compose.yml             # Local deployment orchestration
└── README.md                      # Guides and references
```

---

## 🚀 Setup & Execution Guiding Steps

### 1. Database Migrations
Provision a new database instance via **Supabase Console**. Under **SQL Editor**, execute the contents of `/supabase_schema.sql` to establish the tables structure, vectors extensions, and indexing.

Ensure your `.env` contains:
```env
DATABASE_URL="postgresql://postgres:[password]@db.supabase.co:5432/postgres"
SUPABASE_URL="https://[project-id].supabase.co"
SUPABASE_KEY="[service-role-secret-key]"
SECRET_KEY="[arbitrary-jwt-session-key]"
```

### 2. Dataset Compilation & Preprocessing
Execute the data-pipeline command to automatically download **ArtEmis**, **PoetryFoundation**, and **GoEmotions** datasets from HuggingFace, balance class ratios, and output train files:
```bash
python data_pipeline.py --stage roberta
```
This produces `data/roberta_train.csv` and `data/roberta_val.csv`.

### 3. RoBERTa Fine-tuning
Initiate sequence-classification fine-tuning utilizing the HuggingFace Trainer configuration described in `train_roberta.md`:
```bash
python train_roberta.py
```
This saves optimized weights to `models/roberta-artemis`.

### 4. Build the FAISS Image Embeddings Index
To build and compile the FAISS exact index over DeepFashion catalog images, run:
```bash
python data_pipeline.py --stage faiss
```
This performs:
1. Ingest of `detection-datasets/deepfashion_inshop`.
2. CLIP `clip-ViT-B-32` image embedding encodings.
3. Writing binary output flat indexes to `models/deepfashion.index` and serial catalog maps to `models/deepfashion_meta.json`.

---

## 🐳 Docker Deployment

To build and boot both Next.js Client and FastAPI ML container nodes simultaneously, execute:
```bash
docker-compose up --build
```
- **Next.js Client**: `http://localhost:3000`
- **FastAPI Core**: `http://localhost:8000`
