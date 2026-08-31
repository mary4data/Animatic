FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080

# --workers 1: the in-memory job store/SSE queues aren't shared across
# workers or instances -- see README for the Cloud Run concurrency note.
CMD exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --workers 1
