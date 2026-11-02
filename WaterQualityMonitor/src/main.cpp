#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

#include "credentials.h"

// ==============================================================================
// Hardware Pin Definitions
// ==============================================================================
// DS18B20 Data wire connected to GPIO4 (requires 4.7 kΩ pull-up to 3.3V)
#define ONE_WIRE_BUS 4

// TDS Analog Output connected to GPIO34 (ADC1_CH6)
// Note: GPIO34 is input-only and part of ADC1, which continues working with Wi-Fi active.
#define TDS_PIN 34

// Reference voltage for ESP32 ADC (using 3.3V rail)
#define VREF 3.3
// Number of analog samples averaged for noise reduction
#define SCOUNT 30

// ==============================================================================
// Global Objects & State Variables
// ==============================================================================
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensors(&oneWire);
WebServer server(80);

// Calibration multiplier for TDS sensor (default 1.0; adjust if calibrating against reference)
#define K_FACTOR 1.0f
// Air cutoff threshold voltage (0.005V avoids suppressing clean low-TDS water)
#define AIR_CUTOFF_VOLTAGE 0.005f

// Sensor reading cache
float currentTemperatureC = 25.0; // Default fallback reference
float currentTdsPpm = 0.0;
float currentTdsRawVoltage = 0.0;
int currentTdsRawAdc = 0;
float currentEcUsCm = 0.0; // Electrical Conductivity in µS/cm

bool tempSensorConnected = false;
bool tdsSensorValid = false;

// Timing intervals
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_INTERVAL_MS = 2000; // Read sensors every 2 seconds

unsigned long lastWifiCheckTime = 0;
const unsigned long WIFI_CHECK_INTERVAL_MS = 10000; // Verify Wi-Fi link every 10 seconds

// ==============================================================================
// Median Filter for Analog ADC Readings
// ==============================================================================
int getMedianNum(int bArray[], int iFilterLen) {
    int bTab[iFilterLen];
    for (byte i = 0; i < iFilterLen; i++) {
        bTab[i] = bArray[i];
    }
    int i, j, bTemp;
    for (j = 0; j < iFilterLen - 1; j++) {
        for (i = 0; i < iFilterLen - j - 1; i++) {
            if (bTab[i] > bTab[i + 1]) {
                bTemp = bTab[i];
                bTab[i] = bTab[i + 1];
                bTab[i + 1] = bTemp;
            }
        }
    }
    if ((iFilterLen & 1) > 0) {
        bTemp = bTab[(iFilterLen - 1) / 2];
    } else {
        bTemp = (bTab[iFilterLen / 2] + bTab[iFilterLen / 2 - 1]) / 2;
    }
    return bTemp;
}

// ==============================================================================
// Sensor Acquisition Function
// ==============================================================================
void readSensors() {
    // --------------------------------------------------------------------------
    // 1. Read DS18B20 Water Temperature
    // --------------------------------------------------------------------------
    tempSensors.requestTemperatures();
    float rawTemp = tempSensors.getTempCByIndex(0);

    // DS18B20 error sentinel values:
    // - DEVICE_DISCONNECTED_C is -127.0 °C (sensor disconnected or missing pull-up)
    // - 85.0 °C is the initial power-on reset state if reading occurs before conversion
    if (rawTemp == DEVICE_DISCONNECTED_C || rawTemp == 85.0 || rawTemp < -40.0 || rawTemp > 125.0) {
        tempSensorConnected = false;
        // Fallback to 25.0 °C standard calibration baseline for TDS compensation
        currentTemperatureC = 25.0;
    } else {
        tempSensorConnected = true;
        currentTemperatureC = rawTemp;
    }

    // --------------------------------------------------------------------------
    // 2. Read Analog TDS Sensor with Noise Filtering
    // --------------------------------------------------------------------------
    int analogBuffer[SCOUNT];
    for (int i = 0; i < SCOUNT; i++) {
        analogBuffer[i] = analogRead(TDS_PIN);
        delay(2);
    }

    // Filter noise using median filtering
    int medianRaw = getMedianNum(analogBuffer, SCOUNT);
    currentTdsRawAdc = medianRaw;

    // Calculate raw voltage (ESP32 ADC is 12-bit: 0 - 4095)
    currentTdsRawVoltage = (medianRaw * VREF) / 4095.0;

    // Validate sensor voltage range (expected 0.0V to 3.3V for TDS module)
    if (currentTdsRawVoltage >= 0.0 && currentTdsRawVoltage <= 3.3) {
        tdsSensorValid = true;

        // ----------------------------------------------------------------------
        // 3. Temperature Compensation & Calculation
        // Water conductivity increases ~2% per °C above 25 °C.
        // Clamp compensation coefficient between 0.6 and 1.8 for safety
        // ----------------------------------------------------------------------
        float compensationCoefficient = 1.0 + 0.02 * (currentTemperatureC - 25.0);
        compensationCoefficient = constrain(compensationCoefficient, 0.6f, 1.8f);
        float compensationVoltage = currentTdsRawVoltage / compensationCoefficient;

        if (compensationVoltage < AIR_CUTOFF_VOLTAGE) {
            // Probe is in air / dry
            currentTdsPpm = 0.0;
            currentEcUsCm = 0.0;
        } else {
            // Standard cubic curve with K_FACTOR calibration multiplier:
            float tds = (133.42 * compensationVoltage * compensationVoltage * compensationVoltage
                        - 255.86 * compensationVoltage * compensationVoltage
                        + 857.39 * compensationVoltage) * 0.5;

            currentTdsPpm = (tds < 0) ? 0.0f : (tds * K_FACTOR);
            // Electrical Conductivity (EC in µS/cm) ≈ 2.0 * TDS (ppm)
            currentEcUsCm = currentTdsPpm * 2.0f;
        }
    } else {
        tdsSensorValid = false;
        currentTdsPpm = 0.0;
        currentEcUsCm = 0.0;
    }

    // --------------------------------------------------------------------------
    // 4. Debug Serial Output
    // --------------------------------------------------------------------------
    Serial.println(F("--- [AquaSense Sensor Telemetry] ---"));
    if (tempSensorConnected) {
        Serial.printf("Temperature   : %.2f °C\n", currentTemperatureC);
    } else {
        Serial.println(F("Temperature   : SENSOR DISCONNECTED (Using 25.0 °C fallback)"));
    }

    if (tdsSensorValid) {
        Serial.printf("TDS Raw ADC   : %d (%.3f V)\n", currentTdsRawAdc, currentTdsRawVoltage);
        Serial.printf("Estimated TDS : %.1f ppm\n", currentTdsPpm);
        Serial.printf("Estimated EC  : %.1f µS/cm\n", currentEcUsCm);
    } else {
        Serial.printf("TDS Sensor    : INVALID VOLTAGE (ADC: %d, %.3f V)\n", currentTdsRawAdc, currentTdsRawVoltage);
    }
    Serial.printf("Wi-Fi Status  : %s (IP: %s)\n", 
                  WiFi.isConnected() ? "Connected" : "Disconnected", 
                  WiFi.isConnected() ? WiFi.localIP().toString().c_str() : "N/A");
    Serial.println();
}

// ==============================================================================
// HTTP API Endpoints
// ==============================================================================
void handleRoot() {
    // Dedicated Water Quality Dashboard website is hosted at http://localhost:8080/
    // Return API status & redirect header to direct user to the dashboard website
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Location", "http://localhost:8080/");
    server.send(302, "text/plain", "Redirecting to Water Quality Monitoring Dashboard: http://localhost:8080/\nTelemetry API available at /api/data");
}

void handleApiData() {
    JsonDocument doc;

    doc["tds_ppm"] = currentTdsPpm;
    doc["tds_raw_v"] = currentTdsRawVoltage;
    doc["tds_raw_adc"] = currentTdsRawAdc;
    doc["tds_status"] = tdsSensorValid ? "ok" : "error";
    doc["ec_us_cm"] = round(currentEcUsCm);

    doc["temp_c"] = currentTemperatureC;
    doc["temp_status"] = tempSensorConnected ? "ok" : "disconnected";

    doc["uptime_s"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.isConnected() ? WiFi.RSSI() : -40;
    doc["ip"] = WiFi.isConnected() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();

    String jsonResponse;
    serializeJson(doc, jsonResponse);

    // Allow Cross-Origin Resource Sharing (CORS) & Private Network Access
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "*");
    server.sendHeader("Access-Control-Allow-Private-Network", "true");
    server.send(200, "application/json", jsonResponse);
}

void handleOptions() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "*");
    server.sendHeader("Access-Control-Allow-Private-Network", "true");
    server.send(204);
}

void handleNotFound() {
    server.send(404, "text/plain", "404 Not Found");
}

// ==============================================================================
// Wi-Fi Connection Manager (Station + SoftAP Fallback)
// ==============================================================================
void connectWifi() {
    WiFi.mode(WIFI_AP_STA);

    if (String(WIFI_SSID) != "YOUR_WIFI_SSID" && strlen(WIFI_SSID) > 0) {
        Serial.printf("[Wi-Fi STA] Connecting to router SSID: %s ...\n", WIFI_SSID);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            Serial.print(F("."));
            attempts++;
        }

        if (WiFi.status() == WL_CONNECTED) {
            Serial.println();
            Serial.printf("[Wi-Fi STA] Connected to Router! IP: http://%s\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.println();
            Serial.println(F("[Wi-Fi STA] Router connection timed out."));
        }
    } else {
        Serial.println(F("[Wi-Fi] Default credentials in credentials.h; activating Hotspot mode."));
    }

    // Always start standalone SoftAP so the ESP32 is immediately accessible
    WiFi.softAP("Water-Intelligence-AP", "12345678");
    Serial.printf("[Wi-Fi AP] Hotspot Broadcast: 'Water-Intelligence-AP' (password: 12345678)\n");
    Serial.printf("[Wi-Fi AP] Direct Web IP: http://%s\n", WiFi.softAPIP().toString().c_str());
}

// ==============================================================================
// Arduino Setup & Loop
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F("     AquaSense: Water Quality Monitoring IoT      "));
    Serial.println(F("=================================================="));

    // Configure ADC pin
    pinMode(TDS_PIN, INPUT);
    analogSetAttenuation(ADC_11db); // 0 - 3.3V full scale range

    // Initialize DS18B20 temperature sensor with internal pullup
    pinMode(ONE_WIRE_BUS, INPUT_PULLUP);
    delay(50);
    tempSensors.begin();
    tempSensors.setWaitForConversion(true);
    tempSensors.setResolution(10);
    int devCount = tempSensors.getDeviceCount();
    Serial.printf("[Sensors] DS18B20 devices found on GPIO%d: %d\n", ONE_WIRE_BUS, devCount);

    // Connect to Wi-Fi
    connectWifi();

    // Setup WebServer endpoints
    server.on("/", HTTP_GET, handleRoot);
    server.on("/api/data", HTTP_GET, handleApiData);
    server.on("/api/data", HTTP_OPTIONS, handleOptions);
    server.onNotFound(handleNotFound);
    server.begin();
    Serial.println(F("[Web] HTTP Server active on port 80."));

    // Initial sensor measurement
    readSensors();
}

void loop() {
    server.handleClient();

    unsigned long currentMillis = millis();

    // Periodic sensor read
    if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL_MS) {
        lastSensorReadTime = currentMillis;
        readSensors();
    }

    // Background Wi-Fi health check & reconnection
    if (currentMillis - lastWifiCheckTime >= WIFI_CHECK_INTERVAL_MS) {
        lastWifiCheckTime = currentMillis;
        if (WiFi.status() != WL_CONNECTED && String(WIFI_SSID) != "YOUR_WIFI_SSID") {
            Serial.println(F("[Wi-Fi] Reconnecting..."));
            WiFi.reconnect();
        }
    }
}
