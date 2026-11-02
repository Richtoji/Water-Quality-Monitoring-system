# 🐳 AquaSense IoT Backend & Dashboard &bull; Docker Deployment Guide

The AquaSense backend application is a production-ready, asynchronous IoT telemetry service built with **Python (FastAPI), Uvicorn, and SQLite**, fully containerized using **Docker** and **Docker Compose**.

It serves the high-performance **Water Quality Dashboard** frontend and provides REST endpoints for real-time telemetry polling, BIS IS 10500 assessment, historical data logging, and CSV exports.

---

## 🚀 Quick Start (One Command)

To build and launch the containerized application:

```bash
docker compose up -d --build
```

The container will automatically compile, mount persistent volumes, start the ASGI server, and run health checks.

### Verify Running Status
```bash
docker ps
```
You should see:
```text
CONTAINER ID   IMAGE                      STATUS                    PORTS                    NAMES
e6eeab5c1101   aquasense-backend:latest   Up (healthy)              0.0.0.0:8080->8080/tcp   aquasense-backend
```

---

## 🌐 Accessing the Application

| Resource | URL | Description |
| :--- | :--- | :--- |
| **AquaSense Dashboard** | [`http://localhost:8080/`](http://localhost:8080/) | Real-time live water quality dashboard UI |
| **Interactive API Docs** | [`http://localhost:8080/docs`](http://localhost:8080/docs) | Swagger OpenAPI interface for testing all endpoints |
| **Live Telemetry API** | [`http://localhost:8080/api/data`](http://localhost:8080/api/data) | Current TDS, Temperature, BIS compliance & palatability |
| **Telemetry History** | [`http://localhost:8080/api/history?limit=50`](http://localhost:8080/api/history?limit=50) | Paginated time-series readings from SQLite |
| **Rolling Statistics** | [`http://localhost:8080/api/stats`](http://localhost:8080/api/stats) | Min, Max, and Average TDS & Temperature analytics |
| **Spreadsheet Export** | [`http://localhost:8080/api/export`](http://localhost:8080/api/export) | Downloadable `.csv` file containing telemetry records |
| **Container Health** | [`http://localhost:8080/api/health`](http://localhost:8080/api/health) | Uptime and hardware connectivity status probe |

---

## ⚙️ Configuration & Environment Variables

You can configure the target ESP32 hardware IP and polling rates directly in `docker-compose.yml` or via `.env`:

```yaml
services:
  aquasense-backend:
    environment:
      - ESP32_URL=http://10.189.27.140   # IP address of your ESP32 hardware
      - POLL_INTERVAL_SEC=3              # Hardware polling frequency in seconds
      - PORT=8080                        # Port exposed to host machine
      - DB_PATH=/app/data/telemetry.db   # SQLite database path inside container
```

### Dynamic IP Configuration via API
You can also update the ESP32 IP at runtime without restarting the container:
```bash
curl -X POST http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{"esp32_url": "http://10.189.27.140", "poll_interval_sec": 3}'
```

---

## 🗄️ Persistent Data Storage

Sensor readings are logged to SQLite inside a Docker volume named `aquasense-data`. 
Data persists across container restarts, image rebuilds, and system reboots.

To backup the database:
```bash
docker cp aquasense-backend:/app/data/telemetry.db ./telemetry_backup.db
```

---

## 🛠️ Management Commands

* **View live logs:**
  ```bash
  docker compose logs -f
  ```
* **Restart the container:**
  ```bash
  docker compose restart
  ```
* **Stop the container:**
  ```bash
  docker compose down
  ```
* **Rebuild after source code changes:**
  ```bash
  docker compose up -d --build
  ```
