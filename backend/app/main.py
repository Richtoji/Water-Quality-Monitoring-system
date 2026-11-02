"""
AquaSense IoT Backend Application (FastAPI).
Serves the Water Quality Dashboard frontend and provides REST APIs for telemetry, history, and hardware config.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse

from app.database import init_db, get_history, get_stats, export_csv_data, insert_reading
from app.models import ConfigUpdate, HealthStatus, TelemetryReading
from app.telemetry import telemetry_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite DB and start background telemetry poller
    init_db()
    telemetry_service.start_background_polling()
    yield
    # Shutdown: Stop poller
    telemetry_service.stop_background_polling()

app = FastAPI(
    title="AquaSense IoT Telemetry API",
    description="Production backend for ESP32 Water Quality Monitoring (TDS & Temperature) with BIS IS 10500 assessment.",
    version="1.0.0",
    lifespan=lifespan
)

# GZip compression middleware for rapid asset loading
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Production security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/data", summary="Get Latest Telemetry")
async def get_telemetry_data():
    """Returns the most recent live telemetry from ESP32, enriched with BIS IS 10500 and WHO assessments."""
    return await telemetry_service.get_latest_data()

@app.post("/api/data", summary="Push Telemetry from ESP32")
async def push_telemetry(payload: TelemetryReading):
    """Allows ESP32 or external sensor agents to push telemetry directly to the backend."""
    palatability = telemetry_service.evaluate_palatability(payload.tds_ppm)
    bis = telemetry_service.evaluate_bis(payload.tds_ppm)
    
    rec_id = insert_reading(
        tds_ppm=payload.tds_ppm,
        temp_c=payload.temp_c,
        raw_v=payload.raw_v,
        raw_adc=payload.raw_adc,
        tds_status=payload.tds_status,
        temp_status=payload.temp_status,
        palatability=palatability,
        potability=bis
    )
    
    # Update live in-memory telemetry state for immediate dashboard reflection
    enriched = telemetry_service.update_pushed_reading(payload, palatability, bis)
    
    return {"status": "success", "id": rec_id, "data": enriched}

@app.get("/api/history", summary="Query Telemetry History")
async def get_telemetry_history(
    limit: int = Query(50, ge=1, le=500, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """Returns historical sensor measurements stored persistently in SQLite."""
    records = get_history(limit=limit, offset=offset)
    return {"records": records, "count": len(records), "limit": limit, "offset": offset}

@app.get("/api/stats", summary="Get Summary Analytics")
async def get_telemetry_stats():
    """Computes Min, Max, Average, and Count for recorded TDS and Temperature."""
    return get_stats()

@app.get("/api/export", summary="Export Telemetry to CSV")
async def export_csv():
    """Downloads all recorded historical sensor readings as a CSV spreadsheet."""
    csv_text = export_csv_data()
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=aquasense_telemetry.csv"}
    )

@app.get("/api/health", response_model=HealthStatus, summary="System Health & Diagnostic")
async def health_check():
    """Health check endpoint for Docker container and orchestrator probes."""
    stats = get_stats()
    return HealthStatus(
        status="healthy",
        service="aquasense-backend",
        version="1.0.0",
        esp32_url=telemetry_service.esp32_url,
        esp32_connected=telemetry_service.is_connected,
        total_stored_readings=stats.get("count", 0)
    )

@app.get("/api/config", summary="Get Active Configuration")
async def get_config():
    """Returns the target ESP32 hardware URL and active polling interval."""
    return {
        "esp32_url": telemetry_service.esp32_url,
        "poll_interval_sec": telemetry_service.poll_interval,
        "is_connected": telemetry_service.is_connected,
        "last_latency_ms": telemetry_service.last_latency_ms
    }

@app.post("/api/config", summary="Update Configuration")
async def update_config(config: ConfigUpdate):
    """Dynamically updates the ESP32 IP address or polling frequency without container restart."""
    telemetry_service.esp32_url = config.esp32_url.rstrip("/")
    if config.poll_interval_sec:
        telemetry_service.poll_interval = config.poll_interval_sec
    return {
        "status": "updated",
        "esp32_url": telemetry_service.esp32_url,
        "poll_interval_sec": telemetry_service.poll_interval
    }

# ---------------------------------------------------------------------------
# Static Web Dashboard Frontend Mount
# ---------------------------------------------------------------------------

STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")
if not os.path.exists(STATIC_DIR):
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "water-quality-dashboard"))

if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
