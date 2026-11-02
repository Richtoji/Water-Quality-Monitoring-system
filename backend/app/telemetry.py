"""
Telemetry Manager for AquaSense IoT System.
Handles communication with ESP32, BIS IS 10500 assessment, in-memory caching, and persistence.
"""

import asyncio
import logging
import time
import os
from datetime import datetime
from typing import Optional, Dict, Any
import json

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    import urllib.request
    HAS_HTTPX = False

from app.database import insert_reading, get_stats
from app.models import TelemetryReading

logger = logging.getLogger("aquasense.telemetry")

class TelemetryService:
    def __init__(self):
        self.esp32_url = os.getenv("ESP32_URL", "http://10.189.27.140").rstrip("/")
        self.poll_interval = int(os.getenv("POLL_INTERVAL_SEC", "3"))
        self.is_connected = False
        self.last_latency_ms: Optional[int] = None
        self.last_poll_time: Optional[float] = None
        self.latest_reading: Optional[Dict[str, Any]] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def evaluate_palatability(self, tds: float) -> str:
        if tds < 300:
            return "Excellent"
        elif tds <= 600:
            return "Good"
        elif tds <= 900:
            return "Fair"
        elif tds <= 1200:
            return "Poor"
        else:
            return "Unacceptable"

    def evaluate_bis(self, tds: float) -> str:
        if tds <= 500:
            return "Within Acceptable Limit (<= 500 mg/L)"
        elif tds <= 2000:
            return "Within Permissible Limit in Absence of Alternate Source (500 - 2000 mg/L)"
        else:
            return "Exceeds Permissible Limit (> 2000 mg/L)"

    def update_pushed_reading(self, payload: TelemetryReading, palatability: str, bis: str) -> Dict[str, Any]:
        """Updates in-memory state when telemetry is pushed from ESP32 or an external agent."""
        volts = payload.raw_v if payload.raw_v is not None else payload.tds_raw_v
        adc = payload.raw_adc if payload.raw_adc is not None else payload.tds_raw_adc
        enriched = {
            "tds_ppm": payload.tds_ppm,
            "temp_c": payload.temp_c,
            "raw_v": volts if volts is not None else 0.0,
            "raw_adc": adc if adc is not None else 0,
            "tds_raw_v": volts if volts is not None else 0.0,
            "tds_raw_adc": adc if adc is not None else 0,
            "uptime_s": payload.uptime_s,
            "wifi_rssi": payload.wifi_rssi,
            "tds_status": payload.tds_status,
            "temp_status": payload.temp_status,
            "palatability": palatability,
            "bis_compliance": bis,
            "timestamp": datetime.now().isoformat(),
            "esp32_connected": True,
            "latency_ms": 0,
            "device_ip": payload.ip or "ESP32 (Live Cloud Push)"
        }
        self.latest_reading = enriched
        self.is_connected = True
        self.last_poll_time = time.time()
        self.last_latency_ms = 0
        return enriched

    async def fetch_esp32_now(self) -> Dict[str, Any]:
        """Performs a direct async HTTP fetch from the ESP32 /api/data endpoint."""
        if not self.esp32_url or self.esp32_url.lower() in ["none", "cloud", "push", ""]:
            if self.latest_reading:
                return self.latest_reading
            return self._build_empty_reading("Awaiting Cloud Push Telemetry")

        url = f"{self.esp32_url}/api/data"
        start = time.perf_counter()
        
        if HAS_HTTPX:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
        else:
            def _fetch():
                req = urllib.request.Request(url, headers={'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=3.0) as r:
                    return json.loads(r.read().decode())
            data = await asyncio.to_thread(_fetch)

        latency = int((time.perf_counter() - start) * 1000)

        tds = float(data.get("tds_ppm", 0))
        temp = float(data.get("temp_c", 0))
        raw_v = data.get("raw_v")
        raw_adc = data.get("raw_adc")
        tds_status = data.get("tds_status", "ok")
        temp_status = data.get("temp_status", "ok")

        palatability = self.evaluate_palatability(tds)
        bis = self.evaluate_bis(tds)

        enriched = {
            "tds_ppm": tds,
            "temp_c": temp,
            "raw_v": raw_v if raw_v is not None else 0.0,
            "raw_adc": raw_adc if raw_adc is not None else 0,
            "tds_raw_v": raw_v if raw_v is not None else 0.0,
            "tds_raw_adc": raw_adc if raw_adc is not None else 0,
            "tds_status": tds_status,
            "temp_status": temp_status,
            "palatability": palatability,
            "bis_compliance": bis,
            "timestamp": datetime.now().isoformat(),
            "esp32_connected": True,
            "latency_ms": latency,
            "device_ip": self.esp32_url.replace("http://", "").replace("https://", "")
        }

        self.latest_reading = enriched
        self.is_connected = True
        self.last_latency_ms = latency
        self.last_poll_time = time.time()

        # Record in SQLite history
        try:
            insert_reading(
                tds_ppm=tds,
                temp_c=temp,
                raw_v=raw_v,
                raw_adc=raw_adc,
                tds_status=tds_status,
                temp_status=temp_status,
                palatability=palatability,
                potability=bis
            )
        except Exception as e:
            logger.error(f"Failed to persist reading to database: {e}")

        return enriched

    def _build_empty_reading(self, bis_text: str = "Awaiting Live Telemetry") -> Dict[str, Any]:
        return {
            "tds_ppm": 0.0,
            "temp_c": 0.0,
            "raw_v": 0.0,
            "raw_adc": 0,
            "tds_raw_v": 0.0,
            "tds_raw_adc": 0,
            "tds_status": "offline",
            "temp_status": "offline",
            "palatability": "Unknown",
            "bis_compliance": bis_text,
            "timestamp": datetime.now().isoformat(),
            "esp32_connected": False,
            "latency_ms": None,
            "device_ip": self.esp32_url.replace("http://", "").replace("https://", "") if self.esp32_url else "cloud"
        }

    async def get_latest_data(self) -> Dict[str, Any]:
        """Returns the latest reading, actively attempting a live fetch if stale."""
        now = time.time()
        
        # If we received a cloud push reading within the last 120 seconds, treat it as live!
        if self.latest_reading and self.last_poll_time and (now - self.last_poll_time <= 120):
            return self.latest_reading

        # If in cloud push mode or running in Catalyst AppSail cloud, simply return latest reading
        if not self.esp32_url or self.esp32_url.lower() in ["none", "cloud", "push", ""] or os.getenv("X_ZOHO_CATALYST_LISTEN_PORT"):
            return self.latest_reading or self._build_empty_reading("Awaiting Cloud Push Telemetry")

        if not self.latest_reading or (self.last_poll_time and (now - self.last_poll_time > self.poll_interval)):
            try:
                return await self.fetch_esp32_now()
            except Exception as e:
                self.is_connected = False
                logger.debug(f"Could not reach ESP32 at {self.esp32_url}: {e}")
                if self.latest_reading:
                    cached = dict(self.latest_reading)
                    if self.last_poll_time and (now - self.last_poll_time < 120):
                        cached["esp32_connected"] = True
                    else:
                        cached["esp32_connected"] = False
                        cached["status_note"] = "Using cached reading; awaiting new push"
                    return cached
                return self._build_empty_reading()
        return self.latest_reading

    async def _poll_loop(self):
        """Continuous background poller keeping telemetry cache fresh."""
        while self._running:
            # In cloud environments, ESP32 pushes to us, so we don't block polling a local LAN IP
            if not os.getenv("X_ZOHO_CATALYST_LISTEN_PORT") and self.esp32_url and self.esp32_url.lower() not in ["none", "cloud", "push", ""]:
                try:
                    await self.fetch_esp32_now()
                except Exception as e:
                    self.is_connected = False
                    logger.debug(f"Background poll tick: ESP32 offline ({e})")
            await asyncio.sleep(self.poll_interval)

    def start_background_polling(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._poll_loop())
            logger.info(f"Started background polling ESP32 at {self.esp32_url} every {self.poll_interval}s")

    def stop_background_polling(self):
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

telemetry_service = TelemetryService()
