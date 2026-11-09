FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Train the demo ML model at build time, then drop root: the app runs as an unprivileged user.
RUN python -m app.ml.train \
 && useradd --create-home --uid 10001 app \
 && mkdir -p /app/data && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
