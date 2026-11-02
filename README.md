# 🌊 AquaSense &bull; Real-Time IoT Water Quality Monitoring System

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-1.0.0-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ESP32](https://img.shields.io/badge/Hardware-ESP32-E7352C?logo=espressif&logoColor=white)](https://www.espressif.com/)
[![Standard](https://img.shields.io/badge/Standard-BIS%20IS%2010500%3A2012-0052CC)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg)]()

AquaSense is an end-to-end, IoT-enabled intelligent water quality assessment system. It combines ESP32 microcontroller telemetry (analog TDS sensor + digital DS18B20 temperature sensor), a containerized asynchronous Python backend (FastAPI + SQLite), and an ambient glassmorphic web dashboard with real-time BIS IS 10500:2012 drinking water compliance scoring.

---

## 🌟 System Architecture

```text
  [ Physical Water Sample ]
             │
             ▼
  ┌────────────────────────────────────────────────────────┐
  │                   ESP32 Microcontroller                │
  │  • Analog TDS Sensor (ADC GPIO 34)                     │
  │  • DS18B20 Waterproof Temp Sensor (OneWire GPIO 4)     │
  │  • Station Wi-Fi + SoftAP Failover                     │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  REST API / JSON
  ┌────────────────────────────────────────────────────────┐
  │           AquaSense Containerized Backend              │
  │                   (Python FastAPI)                     │
  │  • Telemetry Ingestion & Caching                       │
  │  • BIS IS 10500:2012 & WHO Palatability Assessment     │
  │  • Persistent SQLite Time-Series Logging               │
  │  • Automated Health Probes & CSV Exporter              │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  Port 8080 (HTTP / WebSocket)
  ┌────────────────────────────────────────────────────────┐
  │         AquaSense Glassmorphic Web Dashboard           │
  │  • Real-Time Water Gauge & Animated Liquid Tank        │
  │  • BIS IS 10500 Reference Comparison Matrix            │
  │  • Dual-Axis Chart.js Historical Visualizer            │
  └────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```text
Water-Quality-Monitoring-system/
├── backend/                        # Containerized FastAPI telemetry service
│   ├── app/
│   │   ├── main.py                 # REST endpoints & static dashboard mount
│   │   ├── telemetry.py            # Async poller, BIS evaluator & cache
│   │   ├── database.py             # SQLite time-series logger & CSV exporter
│   │   └── models.py               # Pydantic schemas
│   ├── Dockerfile                  # Python 3.11-slim production container
│   └── requirements.txt            # FastAPI, Uvicorn, HTTPX
├── water-quality-dashboard/        # Pure HTML5/CSS3/Vanilla JS Frontend
│   ├── index.html                  # Responsive dashboard & compliance tables
│   ├── css/style.css               # Modern glassmorphism & micro-animations
│   ├── js/app.js                   # Chart.js engine, live streaming & simulation
│   └── vercel.json                 # Zero-config static deployment for Vercel
├── WaterQualityMonitor/            # ESP32 PlatformIO C++ firmware
│   ├── src/main.cpp                # Dual sensor sampling, filtering & WebServer
│   ├── platformio.ini              # ESP32 toolchain & library dependencies
│   └── include/credentials.h.example # Wi-Fi credentials template
├── docker-compose.yml              # One-command orchestration
├── DOCKER_DEPLOYMENT.md            # In-depth Docker deployment manual
└── README.md                       # Main documentation
```

---

## 🚀 Quick Start (Docker)

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine installed.

### Launch the Entire Stack
From the repository root:

```bash
docker compose up -d --build
```

Access the application in your browser:
* **Web Dashboard**: [`http://localhost:8080/`](http://localhost:8080/)
* **Interactive API Swagger UI**: [`http://localhost:8080/docs`](http://localhost:8080/docs)
* **Live Telemetry API**: [`http://localhost:8080/api/data`](http://localhost:8080/api/data)
* **History Endpoint**: [`http://localhost:8080/api/history`](http://localhost:8080/api/history)
* **CSV Export**: [`http://localhost:8080/api/export`](http://localhost:8080/api/export)

---

## 📊 Water Quality Compliance Reference (BIS IS 10500:2012)

The system automatically categorizes live water readings against standard Indian drinking water specifications:

| Parameter | Acceptable Limit | Permissible Limit (No Alternate Source) | Units | System Evaluation |
| :--- | :--- | :--- | :--- | :--- |
| **Total Dissolved Solids (TDS)** | **500** | **2000** | mg/L (ppm) | Evaluated dynamically |
| **Water Temperature** | **20.0 – 30.0** | Acceptable Ambient Range | °C | Thermal suitability check |

---

## 🔧 ESP32 Hardware Setup

1. **Wiring**:
   - TDS Sensor Signal &rarr; **GPIO 34** (Analog ADC1)
   - DS18B20 Signal &rarr; **GPIO 4** (with 4.7kΩ pull-up resistor to 3.3V)
   - VCC &rarr; 3.3V / 5V
   - GND &rarr; Common Ground
2. **Build and Flash**:
   ```bash
   cd WaterQualityMonitor
   pio run --target upload
   ```

---

## ☁️ Cloud Deployment Options

* **Docker Cloud (Render / Railway)**: Build using `backend/Dockerfile`. The backend serves both API endpoints and the static UI.
* **Vercel (Frontend)**: Deploy the `water-quality-dashboard` folder directly to Vercel for zero-cold-start global CDN caching.

---

## 📄 License
This project is licensed under the MIT License.
