# Water Intelligence &bull; Advanced IoT Water Quality Dashboard

An award-winning, production-ready static web dashboard for real-time ESP32 water quality telemetry (Total Dissolved Solids & Water Temperature). 

Built with **pure HTML5, CSS3, Vanilla JavaScript, and Chart.js**. Zero frameworks, zero Node.js server dependencies, and ready for instant deployment to **Vercel**.

---

## 🌟 Key Features & Design System

* 🌊 **Living Ambient Aquatic Canvas**: Real-time bioluminescent particles and micro-bubbles gently floating in the background, simulating underwater depth with high-performance canvas physics.
* 🧪 **Dynamic Visual Liquid Tank**: An animated water beaker graphic inside the TDS card that dynamically fills, bubbles, and shifts color in real time based on mineral concentration (cyan &rarr; emerald &rarr; amber &rarr; rose).
* 🌡️ **Fluid Mercury Thermometer**: An animated vertical glass tube showing thermal expansion and glowing mercury levels responsive to water temperature.
* 🎯 **Water Health Index (WQS) Radial Gauge**: A circular progress ring (0–100 score) scoring mineral balance and palatability against WHO and EPA guidelines.
* 🎮 **Interactive Simulation Sandbox**: In Demo Mode, click instant real-world water presets to watch the gauges, charts, and tanks react dynamically:
  * **Pure RO** (25 ppm, 19.5 °C)
  * **Mountain Spring** (85 ppm, 16.2 °C)
  * **City Municipal Tap** (225 ppm, 22.5 °C)
  * **Hard Well Water** (420 ppm, 23.8 °C)
  * **Elevated Runoff** (680 ppm, 28.0 °C)
* 📊 **Dual-Axis Chart.js Visualization**: Interactive real-time time-series graph with gradient fills, interactive tooltips, and metric filtering (Both / TDS Only / Temp Only).
* ⏸️ **Live Stream Pause & Resume**: Freeze the graph at any moment to inspect historical peaks without losing incoming telemetry.
* 📥 **One-Click CSV Export**: Download live or historical sensor readings into a standard CSV file for spreadsheet analysis.
* 📈 **Rolling Analytics Engine**: Real-time statistical analysis computing Min, Max, Mean, and Trend direction (📈 Rising / 📉 Falling / ➡️ Stable).
* 📺 **Kiosk / Fullscreen Mode**: Perfect for wall-mounted tablets, lab monitors, or smart home displays.
* ⚙️ **Configurable in One Place**: Simple Settings modal allows updating the ESP32 IP or domain name with persistent `localStorage` saving.

---

## 📁 Project Structure

```text
water-quality-dashboard/
├── index.html        # Semantic HTML5 markup, visual gauges, and SVG rings
├── css/
│   └── style.css     # Futuristic glassmorphic design system and micro-animations
├── js/
│   └── app.js        # Ambient canvas, simulation sandbox, Chart.js engine & API fetcher
├── vercel.json       # Vercel static deployment and security headers
└── README.md         # Testing and deployment documentation
```

---

## 💻 Local Testing & Preview

You can run the dashboard locally on any web browser using any simple static file server:

### Option 1: Python Built-in Server (Recommended)
Open your terminal in the `water-quality-dashboard` directory:
```bash
python -m http.server 8080
```
Open **`http://localhost:8080`** in your browser.

### Option 2: Node `npx serve`
```bash
npx serve .
```

---

## 🚀 Deploying to Vercel (2 Minutes)

The dashboard is structured specifically for zero-configuration static deployment to Vercel.

### Method A: Deploy via Vercel CLI
1. Open your terminal in the `water-quality-dashboard` folder.
2. Run:
   ```bash
   npx vercel
   ```
3. Follow the CLI prompts (accept default settings). Vercel will output a live production URL (e.g., `https://aquasense-dashboard.vercel.app`).

### Method B: Deploy via GitHub & Vercel Dashboard
1. Push the `water-quality-dashboard` directory to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) and log in.
3. Click **"Add New..."** &rarr; **"Project"**.
4. Import your GitHub repository.
5. In **Root Directory**, select `water-quality-dashboard` (or leave as root if it's a dedicated repo).
6. Click **Deploy**. Your site will be live within seconds!

---

## 🔗 Connecting to Your ESP32 Hardware

1. Switch the dashboard mode at the top from **Simulation** to **Live ESP32**.
2. Click the **Config** (gear icon) button in the top navigation bar.
3. Enter your ESP32's local IP address (e.g. `http://192.168.1.150`).
4. Click **Test Connection Ping** to verify network connectivity.
5. Click **Save Settings**. The dashboard will now stream live telemetry directly from your ESP32!

> [!NOTE]
> ### 🛡️ Note on HTTPS Mixed Content (Vercel Deployments)
> When deployed to Vercel, the website is served over **HTTPS** (`https://...`). Modern web browsers automatically block JavaScript on HTTPS pages from making unencrypted HTTP requests to private local IPs (`http://192.168.x.x`) to prevent mixed content security issues.
> 
> * **For local network testing with your ESP32**: We recommend opening the dashboard via **`http://localhost:8080`** on your local network, where both the dashboard and the ESP32 communicate over HTTP.
> * **For remote Vercel access**: You can use a lightweight local tunnel (e.g., Cloudflare Tunnel, ngrok, or Tailscale) to provide an HTTPS endpoint for your ESP32.

---

## 🔬 Scientific Potability Notice

> **Important:** Total Dissolved Solids (TDS) measures the total mass of dissolved inorganic salts and organic matter, and the DS18B20 measures physical temperature. **TDS and temperature alone DO NOT establish whether water is safe to drink.** They do not identify bacterial pathogens, viruses, pesticides, lead, arsenic, or chlorine. Standardized laboratory testing is required for official drinking water certification.
