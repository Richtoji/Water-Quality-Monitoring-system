#!/bin/sh
PORT="${X_ZOHO_CATALYST_LISTEN_PORT:-8080}"
echo "Starting AquaSense on port ${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --proxy-headers --forwarded-allow-ips='*'
