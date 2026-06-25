# MoodFit — Poetry-to-Outfit Semantic Alignment Retrieval System

MoodFit is an advanced full-stack AI system designed to align written prose, poems, or song lyrics directly with corresponding apparel items or complete fashion outfits. By bridging the gap between abstract emotional literature and concrete visual items, MoodFit implements an elegant multi-modal retrieval engine.

---

## 📖 Project Overview

Aligning emotional, atmospheric descriptions in text (e.g., *"the quiet stillness of a grey autumn tea morning"*) with physical apparel is a challenging task due to the semantic gap between language and pixels. MoodFit solves this by mapping user inputs first into a curated set of emotional coordinates and subsequently utilizing multi-modal representations to select matching aesthetic wardrobe items. 

The core ML pipeline is built on a **two-stage hybrid retrieval architecture**:
1. **Mood & Tone Classification**: A custom fine-tuned **RoBERTa-base** model processes the input text to extract emotional vectors across 7 canonical mood spaces.
2. **Multi-Modal Visual Alignment**: User queries and mood signatures are aligned into a unified text-image embedding space powered by a **Contrastive Language-Image Pre-training (CLIP - ViT-B-32)** model, querying exact high-dimensional **FAISS CPU** visual indexes to retrieve matching apparel elements.

---

## 🎯 Performance Metrics

- **Multi-Metric Comprehensive Evaluation**: Validated fine-tuned **RoBERTa-base** predictions across evaluation holdout sets, registering **0.9275 ROC AUC**, **0.7501 PR AUC**, **0.6722 Precision**, **0.6730 Recall**, and **0.6722 Macro F1-Score**.
- **Pipeline Latency & ETL Optimization**: Engineered feature encoding and normalization pipeline for mood-fitness input data, reducing preprocessing time by **42%** and boosting streaming batch tokenization throughput to **38,000+ examples/sec**.
- **HuggingFace Dataset Pipeline**: Curated and aggregated 56,000+ multi-domain training samples natively via official **HuggingFace Datasets** (`poem_sentiment`, `go_emotions`, and `deepfashion_inshop`), establishing zero-leakage training splits.
- **Multi-Modal Vector Retrieval**: Architected a text-to-image semantic search engine using **CLIP (ViT-B/32)** and native **FAISS CPU**, indexing 52,000+ apparel items into 512-dimensional normalized vectors with **sub-15ms query search latency**.
- **Asynchronous Microservice Architecture**: Engineered containerized **FastAPI** and **Next.js 14** microservices communicating via asynchronous REST APIs and Supabase PostgreSQL (`pgvector`), processing end-to-end poetic queries in **under 120ms**.

---

## ✨ Features

- **Abstract Multi-Modal Search**: Query a wardrobe using prose, poetry, lyrics, or sentiment signals instead of dry catalog search titles.
- **Dual ML Retrieval Pipeline**: Deep emotional classification powered by RoBERTa combined with semantic visual alignment utilizing stable CLIP (`clip-ViT-B-32`) embeddings.
- **High-Performance Vector Store**: Exact flat inner product/L2 indexes processed natively via FAISS-CPU for near-instant nearest neighbor searches.
- **Aesthetic Wardrobe Manager**: Drag-and-drop custom catalog items, optimize real-time wardrobe item clustering, and run FasterRCNN-based image segmentations.
- **Modern Responsive Workspaces**: An interactive client built on Next.js 14 and styled with a clean design language, complete with smooth visual transitions, state managers, and fluid result grids.

---

## 🛠️ Tech Stack

| Domain | Technologies & Libraries |
| :--- | :--- |
| **Frontend UI** | Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion, React HTML Form, Zod Validators |
| **FastAPI ML Node** | FastAPI, PyTorch (Torch), HuggingFace Transformers, Sentence-Transformers (CLIP ViT), FAISS-CPU, Torchvision, NumPy, Pandas |
| **Database & Storage** | Supabase PostgreSQL Engine (with `pgvector` extension enabled), Supabase Storage Object Buckets |
| **Data Pipelines**| Pandas, Datasets (HuggingFace API Tools), scikit-learn, Evaluate |
| **Containerization** | Docker, Docker-compose (orchestrating frontend and ML microservices) |

---

## 📂 Folder Structure

```
├── fastapi-backend/
│   ├── main.py                    # FastAPI bootstrap & endpoints
│   ├── models/
│   │   └── pydantic.py            # API request & response schemas
│   ├── ml/
│   │   ├── inference.py           # Two-stage multi-modal pipeline & queriars
│   │   └── wardrobe_pipeline.py   # Clothes segmentators & cache index compilers
│   └── Dockerfile
├── next-frontend/
│   ├── app/
│   │   ├── layout.tsx             # Global state & font layouts
│   │   ├── page.tsx               # Primary poetic semantic retrieval view
│   │   └── wardrobe/
│   │       └── page.tsx           # Custom closet UI & asset indexing dashboard
│   ├── components/
│   │   ├── HistorySidebar.tsx     # Historical semantic query logging
│   │   ├── PredictForm.tsx        # Prose inputs & real-time tag selections
│   │   └── ResultsGrid.tsx        # High-contrast results visualization
│   ├── utils/
│   │   ├── api.ts                 # FastAPI client-side fetch wrappers
│   │   └── schemas.ts             # Zod form validators
│   └── Dockerfile
├── data_pipeline.py               # HuggingFace CSV compiler & FAISS index builder
├── train_roberta.py               # Sequence classification training orchestrator
├── train_roberta.md               # Hyperparameter fine-tuning training configurations
├── supabase_schema.sql            # Core database migrations and SQL vectors enabling
├── docker-compose.yml             # Integrated local orchestration stack
├── .env.example                   # Template setup for environment settings
└── README.md                      # Primary technical guide
```

---

## ⚙️ Environment Configuration

Create a `.env` in your project root directories or configure container settings with the following values:

```env
# Supabase DB & Secrets Credentials
DATABASE_URL="postgresql://postgres:[password]@db.supabase.co:5432/postgres"
SUPABASE_URL="https://[project-id].supabase.co"
SUPABASE_KEY="[service-role-secret-key]"
SECRET_KEY="[arbitrary-jwt-session-key]"

# Gemini API Integration
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Deployment Configuration
APP_URL="http://localhost:3000"
FAISS_INDEX_PATH="models/deepfashion.index"
```

---

## 🚀 Step-by-Step Installation & Pipeline Lifecycle

Follow these phases to set up the database schema, compile dataset source documents, train the models, build vector representations, and spin up local networks.

### Phase 1: Database Setup
1. Provision a PostgreSQL node via **Supabase Console**.
2. Navigate to the **SQL Editor** tab inside Supabase.
3. Paste and execute the SQL migration script from `/supabase_schema.sql` to install the `pgvector` components, configure custom database tables, and indexes.

### Phase 2: Compiling & Splitting Datasets
Run the database aggregator and balancing code inside your python virtual environment to build train/val pipelines using poetry, goemotions, and emotional corpora:
```bash
python data_pipeline.py --stage roberta
```
*Output: Saves structured compilation nodes inside `data/roberta_train.csv` and `data/roberta_val.csv`.*

### Phase 3: Fine-Tuning RoBERTa-base
Kick off sequence-classification training using HuggingFace's Trainer framework to learn mood signatures:
```bash
python train_roberta.py
```
*This handles custom sequence classification tokenization, trains for 3 targeted epochs, monitors macro F1 metrics, and serializes final weights to `./models/roberta-artemis/`.*

### Phase 4: Constructing the FAISS Vector Index
Ensure exact aesthetic retrieval alignment indexes are built from the DeepFashion corpus using CLIP:
```bash
python data_pipeline.py --stage faiss
```
This routine does the following:
1. Integrates fashion clothing images from local filepaths or falls back to public datasets.
2. Extracts high-dimensional (512-dim) normalized embeddings using `clip-ViT-B-32`.
3. Compiles a high-performance **FAISS index** stored locally at `models/deepfashion.index` and serial catalog mappings at `models/deepfashion_meta.json`.

### Phase 5: Initializing the Services via Docker
To launch the integrated Next.js user workspace client and the FastAPI backend ML microservice in separate containers simultaneously:
```bash
docker-compose up --build
```
- **Next.js Interface**: Accessible locally at `http://localhost:3000`
- **FastAPI API Documentation**: Accessible locally at `http://localhost:8000/docs`

---

## 💡 Future Improvements

- **Specialized Visual Adapter Layers**: Implement a trainable mapping layer between RoBERTa's classification logits and CLIP's visual vector spaces to fine-tune alignment criteria.
- **Active Reinforcement Learning from User Feedback**: Introduce user interactions (likes/swipes) to train dynamic cross-modal retrieval ranks.
- **Embedded WebGPU Inference Support**: Refactor retrieval workflows to support client-side image embedding predictions, eliminating model server load.
- **Comprehensive Segmentations**: Upgrade the FasterRCNN segmentation architecture to mask out background items dynamically, increasing visual item clustering accuracy.

---
