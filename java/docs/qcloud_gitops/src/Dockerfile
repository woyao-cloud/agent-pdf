# ===== 阶段1: 构建 =====
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ===== 阶段2: 运行 =====
FROM python:3.11-slim

RUN groupadd -r app && useradd -r -g app app

WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY app/ ./app/
COPY data/ ./data/

RUN mkdir -p /app/data && chown -R app:app /app/data

USER app
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV DATABASE_URL=sqlite:///./data/users.db
ENV SERVICE_NAME=user-service

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
