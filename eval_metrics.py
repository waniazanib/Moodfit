import json
import os
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.preprocessing import label_binarize
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from datasets import Dataset

# Configuration
VAL_PATH = "./data/roberta_val.csv"
MODEL_DIR = "./models/roberta-artemis"
FALLBACK_MODEL = "roberta-base"
OUTPUT_JSON = "eval_results.JSON" # Saved matching exact requested casing

EMOTION_LABELS = ["melancholic", "joyful", "nostalgic", "energetic", "dark", "romantic", "calm"]
NUM_CLASSES = len(EMOTION_LABELS)

def evaluate_model():
    print(f"Loading validation dataset from {VAL_PATH}...")
    if not os.path.exists(VAL_PATH):
        raise FileNotFoundError(f"Validation dataset not found at {VAL_PATH}")
        
    val_df = pd.read_csv(VAL_PATH)
    y_true = val_df["label_id"].astype(int).values

    # Determine model load path
    load_path = MODEL_DIR if os.path.exists(MODEL_DIR) else FALLBACK_MODEL
    print(f"Loading tokenizer and weights from: {load_path}...")
    tokenizer = AutoTokenizer.from_pretrained(load_path)
    model = AutoModelForSequenceClassification.from_pretrained(load_path, num_labels=NUM_CLASSES)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    # Create HuggingFace dataset and DataLoader for batch processing
    val_ds = Dataset.from_pandas(val_df[["text"]])
    
    def tokenize_fn(batch):
        return tokenizer(batch["text"], padding=True, truncation=True, max_length=512, return_tensors="pt")

    val_ds = val_ds.map(tokenize_fn, batched=True, batch_size=32)
    val_ds.set_format(type="torch", columns=["input_ids", "attention_mask"])
    loader = DataLoader(val_ds, batch_size=32, shuffle=False)

    print("Running inference to gather prediction probabilities...")
    all_probs = []
    
    with torch.no_grad():
        for batch in loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
            all_probs.append(probs)

    y_prob = np.concatenate(all_probs, axis=0)
    y_pred = np.argmax(y_prob, axis=1)

    print("Computing multi-class classification evaluation metrics...")
    
    # 1. Multi-class ROC AUC (One-vs-Rest, Macro average)
    roc_auc = roc_auc_score(y_true, y_prob, multi_class="ovr", average="macro")
    
    # 2. Multi-class PR AUC (Average Precision, One-vs-Rest One-Hot encoded)
    y_true_onehot = label_binarize(y_true, classes=range(NUM_CLASSES))
    pr_auc = average_precision_score(y_true_onehot, y_prob, average="macro")
    
    # 3. Precision, Recall, and F1 (Macro average across all 7 emotional spaces)
    precision = precision_score(y_true, y_pred, average="macro", zero_division=0)
    recall = recall_score(y_true, y_pred, average="macro", zero_division=0)
    f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)

    # Format output JSON dictionary
    results = {
        "pr_auc": float(round(pr_auc, 4)),
        "roc_auc": float(round(roc_auc, 4)),
        "f1": float(round(f1, 4)),
        "precision": float(round(precision, 4)),
        "recall": float(round(recall, 4)),
    }

    # Save to eval_results.JSON (and lowercase standard copy)
    for filename in ["eval_results.JSON", "eval_results.json"]:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"Saved metrics to {filename}")

    print("\n--- Final Evaluation Summary ---")
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    evaluate_model()
