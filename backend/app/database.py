"""
SQLite Database module for AquaSense Telemetry.
Stores live sensor measurements, provides history querying, statistics, and CSV export.
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "telemetry.db"))

def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema if not already present."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                tds_ppm REAL NOT NULL,
                temp_c REAL NOT NULL,
                raw_v REAL,
                raw_adc INTEGER,
                tds_status TEXT DEFAULT 'ok',
                temp_status TEXT DEFAULT 'ok',
                palatability TEXT,
                potability TEXT
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON readings(timestamp DESC);")
        conn.commit()

def insert_reading(
    tds_ppm: float,
    temp_c: float,
    raw_v: Optional[float] = None,
    raw_adc: Optional[int] = None,
    tds_status: str = 'ok',
    temp_status: str = 'ok',
    palatability: Optional[str] = None,
    potability: Optional[str] = None
) -> int:
    """Inserts a new telemetry record into the database."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO readings (
                tds_ppm, temp_c, raw_v, raw_adc, tds_status, temp_status, palatability, potability
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (tds_ppm, temp_c, raw_v, raw_adc, tds_status, temp_status, palatability, potability))
        conn.commit()
        return cursor.lastrowid

def get_history(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Returns the most recent telemetry readings ordered newest first."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, timestamp, tds_ppm, temp_c, raw_v, raw_adc, tds_status, temp_status, palatability, potability
            FROM readings
            ORDER BY id DESC
            LIMIT ? OFFSET ?
        """, (limit, offset))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_stats() -> Dict[str, Any]:
    """Computes summary statistics for TDS and Temperature."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                COUNT(*) as count,
                MIN(tds_ppm) as min_tds,
                MAX(tds_ppm) as max_tds,
                AVG(tds_ppm) as avg_tds,
                MIN(temp_c) as min_temp,
                MAX(temp_c) as max_temp,
                AVG(temp_c) as avg_temp
            FROM readings
        """)
        row = cursor.fetchone()
        if not row or row["count"] == 0:
            return {
                "count": 0,
                "min_tds": None,
                "max_tds": None,
                "avg_tds": None,
                "min_temp": None,
                "max_temp": None,
                "avg_temp": None
            }
        return {
            "count": row["count"],
            "min_tds": round(row["min_tds"], 1) if row["min_tds"] is not None else None,
            "max_tds": round(row["max_tds"], 1) if row["max_tds"] is not None else None,
            "avg_tds": round(row["avg_tds"], 1) if row["avg_tds"] is not None else None,
            "min_temp": round(row["min_temp"], 1) if row["min_temp"] is not None else None,
            "max_temp": round(row["max_temp"], 1) if row["max_temp"] is not None else None,
            "avg_temp": round(row["avg_temp"], 1) if row["avg_temp"] is not None else None,
        }

def export_csv_data() -> str:
    """Returns CSV formatted string of all historical readings."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, timestamp, tds_ppm, temp_c, raw_v, tds_status, temp_status, palatability
            FROM readings
            ORDER BY id ASC
        """)
        rows = cursor.fetchall()

    lines = ["ID,Timestamp,TDS_ppm,Temperature_C,Raw_Voltage_V,TDS_Status,Temp_Status,Palatability"]
    for r in rows:
        lines.append(f"{r['id']},{r['timestamp']},{r['tds_ppm']},{r['temp_c']},{r['raw_v']},{r['tds_status']},{r['temp_status']},{r['palatability'] or ''}")
    return "\n".join(lines)
