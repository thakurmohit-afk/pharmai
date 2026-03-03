FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir setuptools && pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Expose port
EXPOSE 8000

# Seed DB at startup (env vars only available at runtime), then start server
CMD ["sh", "-c", "python -c 'import asyncio; from seed_data import seed_database; asyncio.run(seed_database())' && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
