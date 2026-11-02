"""
Pydantic Models and Schemas for AquaSense Telemetry API.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class TelemetryReading(BaseModel):
    tds_ppm: float = Field(..., description="TDS reading in parts per million (ppm)")
    temp_c: float = Field(..., description="Water temperature in Celsius")
    raw_v: Optional[float] = Field(None, description="Raw analog voltage reading from ADC")
    raw_adc: Optional[int] = Field(None, description="Raw 12-bit ADC integer value")
    tds_raw_v: Optional[float] = Field(None, description="Alias for raw_v")
    tds_raw_adc: Optional[int] = Field(None, description="Alias for raw_adc")
    uptime_s: Optional[int] = Field(None, description="Device uptime in seconds")
    wifi_rssi: Optional[int] = Field(None, description="Device Wi-Fi RSSI in dBm")
    ip: Optional[str] = Field(None, description="Device local IP address")
    tds_status: str = Field("ok", description="Status string for TDS sensor (ok/warn/err)")
    temp_status: str = Field("ok", description="Status string for Temp sensor (ok/warn/err)")

class TelemetryEnriched(TelemetryReading):
    timestamp: str = Field(..., description="Timestamp of the measurement")
    palatability: str = Field(..., description="Palatability rating per WHO guidelines")
    bis_compliance: str = Field(..., description="Compliance assessment per BIS IS 10500:2012")
    esp32_connected: bool = Field(True, description="True if telemetry was fetched live from hardware")
    latency_ms: Optional[int] = Field(None, description="Roundtrip polling latency in milliseconds")

class ConfigUpdate(BaseModel):
    esp32_url: str = Field(..., description="Target IP or hostname of ESP32 (e.g. http://10.189.27.140)")
    poll_interval_sec: Optional[int] = Field(3, description="Polling frequency in seconds", ge=1, le=60)

class HealthStatus(BaseModel):
    status: str = "healthy"
    service: str = "aquasense-backend"
    version: str = "1.0.0"
    esp32_url: str
    esp32_connected: bool
    total_stored_readings: int
