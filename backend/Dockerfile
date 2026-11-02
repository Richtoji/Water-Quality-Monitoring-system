# ==============================================================================
# AquaSense IoT Water Quality Telemetry Backend
# Production Dockerfile - Python 3.11 Slim
# ==============================================================================

FROM python:3.11-slim

# Set environment configuration
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STATIC_DIR=/app/static \
    DB_PATH=/app/data/telemetry.db \
    ESP32_URL=http://10.189.27.140 \
    PORT=8080

WORKDIR /app

# Install system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend application source and startup script
COPY backend/app /app/app
COPY backend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Copy frontend static web dashboard
COPY water-quality-dashboard /app/static

# Ensure persistent data directory exists and is writable by any user
RUN mkdir -p /app/data && chmod -R 777 /app/data

EXPOSE 8080
EXPOSE 9000

# Health check probe adapted for dynamic $PORT and $X_ZOHO_CATALYST_LISTEN_PORT
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-8080}}/api/health || exit 1

# Launch production server via startup script
CMD ["/app/start.sh"]
