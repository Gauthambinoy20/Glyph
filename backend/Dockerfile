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

# Pre-bake the models so the first request is not slowed by a cold download. Best-effort:
# HuggingFace rate-limits shared CI runners, so each download is retried a few times and, if it
# still fails, the build proceeds (the trailing echo keeps the layer non-fatal) and the model
# downloads lazily on first use instead of breaking the image.

# bge-small: the default local embedder, into MODEL_CACHE_DIR where the app reads it.
RUN for i in 1 2 3; do \
      python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/models')" && break || sleep 20; \
    done; echo "bge-small: pre-baked or will download on first use"

# The cross-encoder reranker, so turning on two-stage retrieval is instant.
RUN for i in 1 2 3; do \
      python -c "from fastembed.rerank.cross_encoder import TextCrossEncoder; TextCrossEncoder('Xenova/ms-marco-MiniLM-L-6-v2', cache_dir='/models')" && break || sleep 20; \
    done; echo "reranker: pre-baked or will download on first use"

# The Model2Vec static embedder used by fast mode (EMBED_BACKEND=static).
RUN for i in 1 2 3; do \
      python -c "from model2vec import StaticModel; StaticModel.from_pretrained('minishlab/potion-base-8M')" && break || sleep 20; \
    done; echo "model2vec: pre-baked or will download on first use"

# Copy the application code last (changes most often).
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
