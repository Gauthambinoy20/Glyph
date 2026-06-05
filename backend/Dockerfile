# Glyph backend: FastAPI served by uvicorn, with the local embedding model baked in so the
# first question is not slowed by a cold model download.
FROM python:3.12-slim

# Quieter, faster Python in a container; cache the embedding model under /models.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    MODEL_CACHE_DIR=/models

WORKDIR /app

# git is needed at runtime to clone public GitHub repos for ingestion.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Install pinned dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download bge-small into the image (into MODEL_CACHE_DIR, where the app reads it).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/models')"

# Pre-download the cross-encoder reranker too, so turning on two-stage retrieval is instant.
RUN python -c "from fastembed.rerank.cross_encoder import TextCrossEncoder; TextCrossEncoder('Xenova/ms-marco-MiniLM-L-6-v2', cache_dir='/models')"

# Pre-download the Model2Vec static embedder used by fast mode (EMBED_BACKEND=static).
RUN python -c "from model2vec import StaticModel; StaticModel.from_pretrained('minishlab/potion-base-8M')"

# Copy the application code last (changes most often).
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
