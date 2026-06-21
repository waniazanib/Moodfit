import os
import evaluate
import numpy as np
import pandas as pd
import torch
import inspect
from datasets import Dataset, DatasetDict
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

# 1. Config & Path Variables
MODEL_NAME = "roberta-base"
TRAIN_PATH = "./data/roberta_train.csv"
VAL_PATH = "./data/roberta_val.csv"
OUTPUT_DIR = "./models/roberta-artemis"

EMOTION_LABELS = ["melancholic", "joyful", "nostalgic", "energetic", "dark", "romantic", "calm"]
label2id = {label: i for i, label in enumerate(EMOTION_LABELS)}
id2label = {i: label for i, label in enumerate(EMOTION_LABELS)}

# 2. Load Datasets
print("Loading data from local storage...")
train_df = pd.read_csv(TRAIN_PATH)
val_df = pd.read_csv(VAL_PATH)

# Convert labels into model-understandable integer IDs
train_df["label"] = train_df["label_id"].astype(int)
val_df["label"] = val_df["label_id"].astype(int)

# Use HuggingFace Datasets for streaming support and batched tokenization
ds_train = Dataset.from_pandas(train_df[["text", "label"]])
ds_val = Dataset.from_pandas(val_df[["text", "label"]])
raw_datasets = DatasetDict({"train": ds_train, "validation": ds_val})

# 3. Tokenization & Formatting
print(f"Loading custom tokenizer for {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

def tokenize_function(example):
    return tokenizer(
        example["text"],
        truncation=True,
        max_length=512,
    )

tokenized_datasets = raw_datasets.map(tokenize_function, batched=True)
data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

# 4. Initialize Sequence Classification Model
print("Initializing RoBERTa-base sequence classification model...")
model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=len(EMOTION_LABELS),
    id2label=id2label,
    label2id=label2id
)

# 5. Define Evaluation Metrics
# We track Accuracy, F1-macro, and F1-weighted to ensure robust multi-class balance monitoring
accuracy_metric = evaluate.load("accuracy")
f1_metric = evaluate.load("f1")

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    preds = np.argmax(predictions, axis=1)
    
    acc = accuracy_metric.compute(predictions=preds, references=labels)["accuracy"]
    f1_macro = f1_metric.compute(predictions=preds, references=labels, average="macro")["f1"]
    f1_weighted = f1_metric.compute(predictions=preds, references=labels, average="weighted")["f1"]
    
    return {
        "accuracy": acc,
        "f1_macro": f1_macro,
        "f1_weighted": f1_weighted,
    }

# 6. Training Configuration
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=16,
    num_train_epochs=3,
    weight_decay=0.01,
    load_best_model_at_end=True,
    metric_for_best_model="f1_macro",
    logging_steps=100,
    save_total_limit=1,
    fp16=torch.cuda.is_available(), # Accelerate via GPU floating-point representation
    report_to="none" # Silences external log tracking
)

# 7. Trainer Orchestration
trainer_params = {
    "model": model,
    "args": training_args,
    "train_dataset": tokenized_datasets["train"],
    "eval_dataset": tokenized_datasets["validation"],
    "data_collator": data_collator,
    "compute_metrics": compute_metrics,
}

# Robust support for HuggingFace Transformers version changes (tokenizer vs processing_class in Trainer)
trainer_init_signature = inspect.signature(Trainer.__init__).parameters
if "processing_class" in trainer_init_signature:
    trainer_params["processing_class"] = tokenizer
else:
    trainer_params["tokenizer"] = tokenizer

trainer = Trainer(**trainer_params)

# 8. Start Fine-Tuning
print("Starting training process...")
trainer.train()

# 9. Save Best Weights
print(f"Saving final fine-tuned model and tokenizer to {OUTPUT_DIR}...")
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print("Finished fine-tuning RoBERTa successfully!")
