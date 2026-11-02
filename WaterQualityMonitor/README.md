# AquaSense: Water Quality Monitoring IoT System

A beginner-friendly, complete IoT system built using the **ESP32 DevKit V1**, **DS18B20 Temperature Sensor**, **Analog TDS Sensor**, and **PlatformIO**.

---

## ⚠️ Critical Hardware & Voltage Safety Notice

> [!CAUTION]
> **ESP32 ADC pins (such as GPIO34) must NEVER receive more than 3.3 V!**
> 
> * **Analog TDS Sensor Power**: Power the TDS interface module from the ESP32 **3.3 V pin**, NOT 5 V / VIN. When powered by 3.3 V, its analog output ranges from **0.0 V to 2.3 V**, which is safe for the ESP32.
> * **DS18B20 Power**: Connect to **3.3 V** and **GND**. A **4.7 kΩ pull-up resistor** is required between the DS18B20 **DATA** line and the **3.3 V** line.
> * **GPIO34**: GPIO34 is part of **ADC1**. Always use ADC1 pins for analog sensors because ADC2 is disabled whenever Wi-Fi is active on the ESP32.

---

## 🔬 Scientific & Potability Notice

> [!IMPORTANT]
> **TDS and temperature alone DO NOT establish whether water is safe to drink.**
> 
> * **TDS** measures the total concentration of dissolved charged ions (calcium, magnesium, sodium, carbonates, chlorides, etc.).
> * TDS **does NOT** test for pathogenic bacteria, viruses, parasites, heavy metals, chlorine, pharmaceuticals, or toxic synthetic chemicals.
> * Water with 100 ppm TDS can still contain deadly pathogens, while water with 400 ppm can be safe mineral spring water. Certified laboratory testing is required to verify drinking water potability.

---

## 🔌 Hardware Wiring Diagram

### 1. DS18B20 Temperature Sensor (Waterproof Probe)
| DS18B20 Wire Color | Function | ESP32 Pin / Rail |
| :--- | :--- | :--- |
| **Red** | Power (VCC) | **3.3 V** |
| **Black / Blue** | Ground (GND) | **GND** |
| **Yellow / White** | Data (OneWire) | **GPIO4** |
| **4.7 kΩ Resistor** | Pull-up | Between **DATA (GPIO4)** and **3.3 V** |

### 2. Analog TDS Sensor Module
| TDS Board Pin | Function | ESP32 Pin / Rail |
| :--- | :--- | :--- |
| **+ / VCC** | Power | **3.3 V** *(Do NOT use 5V/VIN!)* |
| **- / GND** | Ground | **GND** |
| **A / Signal (AOUT)** | Analog Output | **GPIO34** (ADC1_CH6) |

---

## 📁 Project Structure

```text
WaterQualityMonitor/
├── platformio.ini         # PlatformIO environment, board & library dependencies
├── include/
│   ├── credentials.h      # Wi-Fi SSID and Password configuration
│   └── dashboard.h        # Modern responsive Web Dashboard stored in PROGMEM
├── src/
│   └── main.cpp           # Complete sensor firmware, filtering, and HTTP JSON API
├── data/                  # Standalone frontend files (for reference or LittleFS)
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md              # Full documentation and wiring guide
```

---

## 🚀 Step-by-Step Getting Started Guide

### Step 1: Configure Wi-Fi Credentials
1. Open [`include/credentials.h`](file:///c:/Users/LENOVO/OneDrive/Desktop/Water%20qulity%20monitoring/WaterQualityMonitor/include/credentials.h).
2. Enter your 2.4 GHz Wi-Fi credentials:
   ```cpp
   const char* WIFI_SSID     = "Your_WiFi_Network";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";
   ```
*(Note: ESP32 only supports 2.4 GHz networks, not 5 GHz)*.

### Step 2: Build the Firmware
In PlatformIO:
* Click the **Build** icon (Checkmark `✓`) in the bottom status bar, or open the PlatformIO terminal and run:
  ```powershell
  pio run -d WaterQualityMonitor
  ```

### Step 3: Connect Hardware & Upload
1. Connect your ESP32 to your PC using a USB data cable.
2. Click the **Upload** icon (Right arrow `→`) in the bottom status bar, or run:
  ```powershell
  pio run -d WaterQualityMonitor --target upload
  ```
*(If the upload stalls on `Connecting........_____`, press and hold the `BOOT` button on your ESP32 for 2 seconds)*.

### Step 4: Open Serial Monitor
1. Click the **Serial Monitor** icon (Plug icon) in the bottom status bar.
2. Observe the startup output at **115200 baud**:
   ```text
   [Wi-Fi] Connected! IP Address: 192.168.1.150
   [Web] Open http://192.168.1.150 in your browser to view the dashboard.
   ```

### Step 5: View the Web Dashboard
* Open any web browser on your PC or smartphone connected to the same Wi-Fi network.
* Navigate to `http://<ESP32-IP-ADDRESS>` (e.g., `http://192.168.1.150`).
* You will see the live, real-time AquaSense Dashboard with live TDS cards, temperature metrics, and real-time history charts!
