# Glyph backend: FastAPI served by uvicorn, with the local embedding model baked in so the
# first question is not slowed by a cold model download.
FROM python:3.12-slim

# Quieter, faster Python in a container; cache the embedding model under /models.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    MODEL_CACHE_DIR=/models

WORKDIR /app

# Install pinned dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download bge-small into the image (into MODEL_CACHE_DIR, where the app reads it).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/models')"

# Copy the application code last (changes most often).
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
