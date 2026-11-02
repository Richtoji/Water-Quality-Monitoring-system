/**
 * Water Intelligence - Environmental IoT Dashboard Logic Engine
 * Pure Vanilla JavaScript + Chart.js
 * Features: Animated Number Transitions, Micro Sparklines, Live Readings Table,
 * Ambient Fluid Canvas, Simulation Sandbox, and Live ESP32 API Fetcher.
 */

(function () {
    'use strict';

    // ==========================================================================
    // Configuration & State
    // ==========================================================================
    const DEFAULT_CONFIG = {
        esp32Url: 'http://10.189.27.140',
        pollIntervalMs: 2000,
        maxHistoryPoints: 25,
        defaultMode: 'live'
    };

    // Detect hosted origin & HTTPS protocol
    const currentOrigin = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : '';
    const isHttps = window.location.protocol === 'https:';

    // Use current origin if hosted, or saved override, or fallback to default ESP32 LAN IP
    const savedUrl = localStorage.getItem('waterIntel_esp32_url');
    let initialUrl;
    if (isHttps) {
        initialUrl = (savedUrl && savedUrl.startsWith('https://')) ? savedUrl : (currentOrigin || DEFAULT_CONFIG.esp32Url);
    } else {
        const isStale = !savedUrl || savedUrl.includes('192.168.') || savedUrl.includes('10.245.163.') || savedUrl.includes('127.0.0.1');
        initialUrl = isStale ? (currentOrigin || DEFAULT_CONFIG.esp32Url) : savedUrl;
    }

    const state = {
        mode: 'live',
        esp32Url: initialUrl,
        pollIntervalMs: parseInt(localStorage.getItem('waterIntel_poll_rate'), 10) || DEFAULT_CONFIG.pollIntervalMs,
        pollTimer: null,
        isStreamPaused: false,
        chartInstance: null,
        chartFilter: 'all', // 'all', 'tds', 'temp'
        history: {
            timestamps: [],
            tds: [],
            temp: [],
            rawVolts: [],
            records: [] // Full structured records for data table
        },
        displayedValues: {
            tds: 0,
            temp: 0
        },
        simulated: {
            targetTds: 235.0,
            currentTds: 235.0,
            targetTemp: 22.4,
            currentTemp: 22.4,
            uptimeSeconds: 320
        },
        analysis: {
            status: 'idle', // 'idle' | 'running' | 'completed'
            samples: [],
            snapshot: null
        },
        currentLiveTelemetry: null
    };

    // ==========================================================================
    // DOM Element References
    // ==========================================================================
    const elements = {
        // Mode & Navigation
        btnModeDemo: document.getElementById('btn-mode-demo'),
        btnModeLive: document.getElementById('btn-mode-live'),
        demoBannerBox: document.getElementById('demo-banner-box'),
        linkSwitchLive: document.getElementById('link-switch-live'),
        deviceStatusBadge: document.getElementById('device-status-badge'),
        deviceStatusText: document.getElementById('device-status-text'),
        heroPlatformTag: document.getElementById('hero-platform-tag'),
        btnToggleFullscreen: document.getElementById('btn-toggle-fullscreen'),

        // TDS Card
        valTds: document.getElementById('val-tds'),
        valTdsClassification: document.getElementById('val-tds-classification'),
        valTdsVoltage: document.getElementById('val-tds-voltage'),
        valTdsEc: document.getElementById('val-tds-ec'),
        badgeTdsStatus: document.getElementById('badge-tds-status'),
        sparklineTds: document.getElementById('sparkline-tds'),

        // Temperature Card
        valTemp: document.getElementById('val-temp'),
        valTempF: document.getElementById('val-temp-f'),
        badgeTempStatus: document.getElementById('badge-temp-status'),
        sparklineTemp: document.getElementById('sparkline-temp'),

        // Connectivity Card
        valConnectivityStatus: document.getElementById('val-connectivity-status'),
        badgeConnectivity: document.getElementById('badge-connectivity'),
        statPingBadge: document.getElementById('stat-ping-badge'),
        valDeviceIp: document.getElementById('val-device-ip'),
        valWifiRssi: document.getElementById('val-wifi-rssi'),
        valUptime: document.getElementById('val-uptime'),

        // Analytics & Diagnostics
        statTdsMinMax: document.getElementById('stat-tds-minmax'),
        statTdsMean: document.getElementById('stat-tds-mean'),
        statTempMinMax: document.getElementById('stat-temp-minmax'),
        statSampleCount: document.getElementById('stat-sample-count'),
        trendIcon: document.getElementById('trend-icon'),
        diagDs18b20: document.getElementById('diag-ds18b20-status'),
        diagTds: document.getElementById('diag-tds-status'),
        diagLatency: document.getElementById('diag-latency'),

        // Chart & Controls
        chartCanvas: document.getElementById('telemetryChart'),
        btnFilterAll: document.getElementById('btn-chart-filter-all'),
        btnFilterTds: document.getElementById('btn-chart-filter-tds'),
        btnFilterTemp: document.getElementById('btn-chart-filter-temp'),
        btnToggleStream: document.getElementById('btn-toggle-stream'),
        textToggleStream: document.getElementById('text-toggle-stream'),
        btnExportCsv: document.getElementById('btn-export-csv'),

        // Readings Table
        readingsTableBody: document.getElementById('readings-table-body'),

        // Settings Modal
        settingsModal: document.getElementById('settings-modal'),
        btnOpenSettings: document.getElementById('btn-open-settings'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelSettings: document.getElementById('btn-cancel-settings'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        inputEsp32Url: document.getElementById('input-esp32-url'),
        selectPollRate: document.getElementById('select-poll-rate'),
        btnTestConnection: document.getElementById('btn-test-connection'),
        toastShelf: document.getElementById('toast-shelf'),

        // Water Usability Verdict Panel
        verdictMasterCard: document.getElementById('verdict-master-card'),
        verdictOverallIcon: document.getElementById('verdict-overall-icon'),
        verdictOverallTitle: document.getElementById('verdict-overall-title'),
        verdictOverallBadge: document.getElementById('verdict-overall-badge'),
        verdictOverallDesc: document.getElementById('verdict-overall-desc'),

        verdictDrinkingStatus: document.getElementById('verdict-drinking-status'),
        verdictDrinkingDesc: document.getElementById('verdict-drinking-desc'),
        verdictDrinkingTip: document.getElementById('verdict-drinking-tip'),

        verdictBoilingStatus: document.getElementById('verdict-boiling-status'),
        verdictBoilingDesc: document.getElementById('verdict-boiling-desc'),
        verdictBoilingTip: document.getElementById('verdict-boiling-tip'),

        verdictHouseholdStatus: document.getElementById('verdict-household-status'),
        verdictHouseholdDesc: document.getElementById('verdict-household-desc'),
        verdictHouseholdTip: document.getElementById('verdict-household-tip'),

        // AQUASENSE – Water Quality Results & Reference Comparison Section
        bisMetaTds: document.getElementById('bis-meta-tds'),
        bisMetaTemp: document.getElementById('bis-meta-temp'),
        bisMetaTimestamp: document.getElementById('bis-meta-timestamp'),
        bisMetaSensorStatus: document.getElementById('bis-meta-sensor-status'),
        bisMetaPrelimBadge: document.getElementById('bis-meta-prelim-badge'),

        bisProminentResultCard: document.getElementById('bis-prominent-result-card'),
        bisResultIcon: document.getElementById('bis-result-icon'),
        bisResultTitle: document.getElementById('bis-result-title'),
        bisResultBadge: document.getElementById('bis-result-badge'),
        bisResultMessage: document.getElementById('bis-result-message'),

        bisSpectrumPin: document.getElementById('bis-spectrum-pin'),
        bisSpectrumPinLabel: document.getElementById('bis-spectrum-pin-label'),

        cmpTableTds: document.getElementById('cmp-table-tds'),
        cmpTableTemp: document.getElementById('cmp-table-temp'),
        cmpTableTdsResult: document.getElementById('cmp-table-tds-result'),
        cmpTableTempResult: document.getElementById('cmp-table-temp-result'),
        refTableTdsVal: document.getElementById('ref-table-tds-val'),
        refTableTempVal: document.getElementById('ref-table-temp-val'),

        appStatusDrinking: document.getElementById('app-status-drinking'),
        appDescDrinking: document.getElementById('app-desc-drinking'),
        appStatusBathing: document.getElementById('app-status-bathing'),
        appDescBathing: document.getElementById('app-desc-bathing'),
        appStatusLaundry: document.getElementById('app-status-laundry'),
        appDescLaundry: document.getElementById('app-desc-laundry'),
        appStatusCleaning: document.getElementById('app-status-cleaning'),
        appDescCleaning: document.getElementById('app-desc-cleaning'),
        appStatusGardening: document.getElementById('app-status-gardening'),
        appDescGardening: document.getElementById('app-desc-gardening'),

        // Interactive Water Analysis Control Hub
        hubProbeIndicator: document.getElementById('hub-probe-indicator'),
        hubProbeText: document.getElementById('hub-probe-text'),
        hubIdleView: document.getElementById('hub-idle-view'),
        hubRunningView: document.getElementById('hub-running-view'),
        hubResultView: document.getElementById('hub-result-view'),
        btnStartAnalysis: document.getElementById('btn-start-analysis'),
        btnReanalyze: document.getElementById('btn-reanalyze'),
        btnPrintReport: document.getElementById('btn-print-report'),
        analysisStepTitle: document.getElementById('analysis-step-title'),
        analysisPercentBadge: document.getElementById('analysis-percent-badge'),
        analysisStepDesc: document.getElementById('analysis-step-desc'),
        analysisProgressBar: document.getElementById('analysis-progress-bar'),

        // Primary Verdict Banner
        hubVerdictBanner: document.getElementById('hub-verdict-banner'),
        verdictBannerIcon: document.getElementById('verdict-banner-icon'),
        verdictBannerKicker: document.getElementById('verdict-banner-kicker'),
        verdictBannerHeadline: document.getElementById('verdict-banner-headline'),
        verdictBannerExplanation: document.getElementById('verdict-banner-explanation'),
        verdictPotabilityPill: document.getElementById('verdict-potability-pill'),
        verdictPalatabilityPill: document.getElementById('verdict-palatability-pill'),

        // Sample Snapshot Elements
        snapTds: document.getElementById('snap-tds'),
        snapTemp: document.getElementById('snap-temp'),
        snapEc: document.getElementById('snap-ec'),
        snapTimestamp: document.getElementById('snap-timestamp'),

        // 6 Household Application Tiles
        tileBadgeDrinking: document.getElementById('tile-badge-drinking'),
        tileDescDrinking: document.getElementById('tile-desc-drinking'),
        tileBadgeCooking: document.getElementById('tile-badge-cooking'),
        tileDescCooking: document.getElementById('tile-desc-cooking'),
        tileBadgeBathing: document.getElementById('tile-badge-bathing'),
        tileDescBathing: document.getElementById('tile-desc-bathing'),
        tileBadgeLaundry: document.getElementById('tile-badge-laundry'),
        tileDescLaundry: document.getElementById('tile-desc-laundry'),
        tileBadgeCleaning: document.getElementById('tile-badge-cleaning'),
        tileDescCleaning: document.getElementById('tile-desc-cleaning'),
        tileBadgeGardening: document.getElementById('tile-badge-gardening'),
        tileDescGardening: document.getElementById('tile-desc-gardening')
    };

    // ==========================================================================
    // Interactive Ambient Fluid Background Canvas
    // ==========================================================================
    function initAmbientCanvas() {
        const canvas = document.getElementById('ambientWaterCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        const particles = [];
        const PARTICLE_COUNT = 32;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                radius: Math.random() * 2.5 + 0.8,
                speedY: Math.random() * 0.4 + 0.15,
                speedX: (Math.random() - 0.5) * 0.2,
                opacity: Math.random() * 0.4 + 0.1,
                color: Math.random() > 0.5 ? 'rgba(6, 182, 212,' : 'rgba(16, 185, 129,'
            });
        }

        function render() {
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.y -= p.speedY;
                p.x += p.speedX;

                if (p.y < -10) {
                    p.y = height + 10;
                    p.x = Math.random() * width;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `${p.color} ${p.opacity})`;
                ctx.shadowBlur = 8;
                ctx.shadowColor = p.color === 'rgba(6, 182, 212,' ? '#06b6d4' : '#10b981';
                ctx.fill();
            }

            requestAnimationFrame(render);
        }

        render();
    }

    // ==========================================================================
    // Animated Number Transition (Easing Function)
    // ==========================================================================
    function animateNumber(element, start, end, duration = 600, decimals = 0) {
        if (!element || isNaN(end)) return;
        if (Math.abs(start - end) < 0.05) {
            element.textContent = decimals > 0 ? end.toFixed(decimals) : Math.round(end);
            return;
        }

        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * easeOut;

            element.textContent = decimals > 0 ? current.toFixed(decimals) : Math.round(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = decimals > 0 ? end.toFixed(decimals) : Math.round(end);
            }
        }

        requestAnimationFrame(update);
    }

    // ==========================================================================
    // Micro Sparklines Renderer
    // ==========================================================================
    function drawSparkline(canvas, data, strokeColor, fillColor) {
        if (!canvas || !data || data.length < 2) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const slice = data.slice(-14);
        const min = Math.min(...slice);
        const max = Math.max(...slice);
        const range = (max - min) || 1;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const step = w / (slice.length - 1);
        for (let i = 0; i < slice.length; i++) {
            const x = i * step;
            const y = h - ((slice[i] - min) / range) * (h - 8) - 4;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Area fill
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    // ==========================================================================
    // Toast Notification System
    // ==========================================================================
    function showToast(message, type = 'info') {
        if (!elements.toastShelf) return;
        const toast = document.createElement('div');
        toast.className = 'toast-pill';

        let color = 'var(--cyan-400)';
        if (type === 'warn') color = 'var(--amber-400)';
        if (type === 'error') color = 'var(--rose-400)';
        if (type === 'success') color = 'var(--emerald-400)';

        toast.innerHTML = `
            <span style="color: ${color}; font-size: 1.1rem; line-height: 1;">&bull;</span>
            <span>${message}</span>
        `;

        elements.toastShelf.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(12px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // ==========================================================================
    // Chart.js Setup & Dual-Axis Config
    // ==========================================================================
    function initChart() {
        if (!elements.chartCanvas || typeof Chart === 'undefined') return;

        const ctx = elements.chartCanvas.getContext('2d');

        const gradientTds = ctx.createLinearGradient(0, 0, 0, 320);
        gradientTds.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
        gradientTds.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

        const gradientTemp = ctx.createLinearGradient(0, 0, 0, 320);
        gradientTemp.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
        gradientTemp.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

        state.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: state.history.timestamps,
                datasets: [
                    {
                        label: 'TDS (ppm)',
                        data: state.history.tds,
                        borderColor: '#22d3ee',
                        backgroundColor: gradientTds,
                        borderWidth: 2.6,
                        fill: true,
                        tension: 0.36,
                        pointRadius: 3.5,
                        pointHoverRadius: 6.5,
                        pointBackgroundColor: '#22d3ee',
                        yAxisID: 'yTds'
                    },
                    {
                        label: 'Temperature (°C)',
                        data: state.history.temp,
                        borderColor: '#fbbf24',
                        backgroundColor: gradientTemp,
                        borderWidth: 2.6,
                        fill: true,
                        tension: 0.36,
                        pointRadius: 3.5,
                        pointHoverRadius: 6.5,
                        pointBackgroundColor: '#fbbf24',
                        yAxisID: 'yTemp'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 350 },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 },
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 16, 29, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255, 255, 255, 0.14)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        callbacks: {
                            label: function (context) {
                                if (context.datasetIndex === 0) {
                                    return ` TDS: ${context.parsed.y.toFixed(1)} ppm`;
                                } else {
                                    return ` Temp: ${context.parsed.y.toFixed(1)} °C`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } }
                    },
                    yTds: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'TDS (ppm)', color: '#22d3ee' },
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: { color: '#22d3ee' },
                        suggestedMin: 0,
                        suggestedMax: 400
                    },
                    yTemp: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Temperature (°C)', color: '#fbbf24' },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#fbbf24' },
                        suggestedMin: 10,
                        suggestedMax: 35
                    }
                }
            }
        });
    }

    function updateChartData(timeLabel, tdsValue, tempValue, record) {
        if (!state.chartInstance || state.isStreamPaused) return;

        state.history.timestamps.push(timeLabel);
        state.history.tds.push(tdsValue);
        state.history.temp.push(tempValue);
        state.history.records.unshift(record);

        if (state.history.timestamps.length > DEFAULT_CONFIG.maxHistoryPoints) {
            state.history.timestamps.shift();
            state.history.tds.shift();
            state.history.temp.shift();
        }

        if (state.history.records.length > 10) {
            state.history.records.pop();
        }

        state.chartInstance.update('none');
        updateRollingAnalytics();
        renderReadingsTable();

        // Update Sparklines
        drawSparkline(elements.sparklineTds, state.history.tds, '#22d3ee', 'rgba(34, 211, 238, 0.15)');
        drawSparkline(elements.sparklineTemp, state.history.temp, '#fbbf24', 'rgba(251, 191, 36, 0.15)');
    }

    // ==========================================================================
    // Analytics & Classification Helpers
    // ==========================================================================
    function classifyTds(ppm, rawVolts) {
        if (rawVolts !== undefined && rawVolts < 0.005 && (ppm === undefined || ppm === 0)) {
            return {
                classification: 'Air Cutoff (Probe Dry)',
                ratingBadge: 'ok',
                color: 'var(--cyan-300)'
            };
        }
        if (ppm < 50) {
            return {
                classification: 'Demineralized (RO/Pure)',
                ratingBadge: 'ok',
                color: 'var(--blue-400)'
            };
        }
        if (ppm <= 150) {
            return {
                classification: 'Soft / Mountain Water',
                ratingBadge: 'ok',
                color: 'var(--cyan-400)'
            };
        }
        if (ppm <= 300) {
            return {
                classification: 'Optimal Mineral Balance',
                ratingBadge: 'ok',
                color: 'var(--emerald-400)'
            };
        }
        if (ppm <= 500) {
            return {
                classification: 'Hard Water Minerals',
                ratingBadge: 'warn',
                color: 'var(--amber-400)'
            };
        }
        return {
            classification: 'Elevated Mineralization',
            ratingBadge: 'error',
            color: 'var(--rose-400)'
        };
    }

    function updateRollingAnalytics() {
        if (state.history.tds.length === 0) return;

        const tdsVals = state.history.tds;
        const tempVals = state.history.temp;

        const minTds = Math.min(...tdsVals);
        const maxTds = Math.max(...tdsVals);
        const meanTds = (tdsVals.reduce((a, b) => a + b, 0) / tdsVals.length).toFixed(1);

        const minTemp = Math.min(...tempVals);
        const maxTemp = Math.max(...tempVals);

        elements.statTdsMinMax.textContent = `${Math.round(minTds)} / ${Math.round(maxTds)} ppm`;
        elements.statTdsMean.textContent = `${meanTds} ppm`;
        elements.statTempMinMax.textContent = `${minTemp.toFixed(1)} / ${maxTemp.toFixed(1)} °C`;
        elements.statSampleCount.textContent = `${tdsVals.length} Recorded`;

        // Rolling trend direction
        if (tdsVals.length >= 4) {
            const last = tdsVals[tdsVals.length - 1];
            const prev = tdsVals[tdsVals.length - 4];
            const delta = last - prev;

            if (delta > 2.5) {
                elements.trendIcon.textContent = '📈 Rising';
                elements.trendIcon.style.color = 'var(--amber-400)';
            } else if (delta < -2.5) {
                elements.trendIcon.textContent = '📉 Falling';
                elements.trendIcon.style.color = 'var(--cyan-400)';
            } else {
                elements.trendIcon.textContent = '➡️ Stable';
                elements.trendIcon.style.color = 'var(--emerald-400)';
            }
        }
    }

    function renderReadingsTable() {
        if (!elements.readingsTableBody) return;
        elements.readingsTableBody.innerHTML = '';

        state.history.records.slice(0, 8).forEach(rec => {
            const tr = document.createElement('tr');
            const tempC = typeof rec.temp_c === 'number' ? rec.temp_c : 0;
            const tempF = ((tempC * 9/5) + 32).toFixed(1);
            const ecVal = typeof rec.ec_us_cm === 'number' ? Math.round(rec.ec_us_cm) : Math.round((rec.tds_ppm || 0) * 2);
            const rawV = typeof rec.tds_raw_v === 'number' ? rec.tds_raw_v : (typeof rec.raw_v === 'number' ? rec.raw_v : 0);
            tr.innerHTML = `
                <td>${rec.timestamp}</td>
                <td style="color: var(--cyan-400); font-weight: 600;">${Math.round(rec.tds_ppm || 0)} ppm</td>
                <td style="color: var(--cyan-300); font-weight: 600;">${ecVal} µS/cm</td>
                <td>${tempC.toFixed(1)} °C</td>
                <td>${tempF} °F</td>
                <td>${rawV.toFixed(3)} V</td>
                <td><span style="color: ${rec.classificationColor || 'var(--text-muted)'}; font-weight: 500;">${rec.classification || 'Normal'}</span></td>
                <td><span class="status-badge ${rec.statusClass || 'ok'}">${rec.statusText || 'Normal'}</span></td>
            `;
            elements.readingsTableBody.appendChild(tr);
        });
    }

    // ==========================================================================
    // Interactive Water Analysis Engine & Official Verdict Controller
    // ==========================================================================
    function updateHubProbeStatus(data) {
        if (!elements.hubProbeIndicator || !elements.hubProbeText) return;
        const rawV = (typeof data.tds_raw_v === 'number') ? data.tds_raw_v : ((typeof data.raw_v === 'number') ? data.raw_v : null);
        const rawAdc = (typeof data.tds_raw_adc === 'number') ? data.tds_raw_adc : ((typeof data.raw_adc === 'number') ? data.raw_adc : null);
        const isAir = (!data.isDemo && ((rawV !== null && rawV < 0.005) || (data.tds_ppm === 0 && (rawAdc === null || rawAdc <= 5))));

        if (isAir) {
            elements.hubProbeIndicator.className = 'probe-indicator-chip chip-ready';
            elements.hubProbeText.textContent = 'Submerge in Water (0 ppm)';
        } else {
            elements.hubProbeIndicator.className = 'probe-indicator-chip chip-submerged';
            elements.hubProbeText.textContent = `Water Detected (${Math.round(data.tds_ppm || 0)} ppm)`;
        }
    }

    async function startWaterAnalysis() {
        if (state.analysis.status === 'running') return;
        state.analysis.status = 'running';
        state.analysis.samples = [];

        // Switch Views
        if (elements.hubIdleView) elements.hubIdleView.style.display = 'none';
        if (elements.hubResultView) elements.hubResultView.style.display = 'none';
        if (elements.hubRunningView) elements.hubRunningView.style.display = 'block';

        const stages = [
            { pct: 20, title: 'Step 1/4: Stabilizing Sensor Contact', desc: 'Acquiring high-resolution analog ADC voltage and checking probe submergence...' },
            { pct: 45, title: 'Step 2/4: Thermal Normalization', desc: 'Applying DS18B20 OneWire temperature compensation to standard 25.0 °C reference...' },
            { pct: 75, title: 'Step 3/4: BIS Standard Specification Check', desc: 'Comparing measured TDS against Indian Drinking Standard BIS IS 10500:2012...' },
            { pct: 95, title: 'Step 4/4: Household Utility Evaluation', desc: 'Computing domestic suitability for drinking, cooking, bathing, laundry, cleaning, and gardening...' },
            { pct: 100, title: 'Analysis Complete', desc: 'Compiling official water potability certificate and household report...' }
        ];

        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            if (elements.analysisStepTitle) elements.analysisStepTitle.textContent = stage.title;
            if (elements.analysisPercentBadge) elements.analysisPercentBadge.textContent = `${stage.pct}%`;
            if (elements.analysisStepDesc) elements.analysisStepDesc.textContent = stage.desc;
            if (elements.analysisProgressBar) elements.analysisProgressBar.style.width = `${stage.pct}%`;

            if (state.currentLiveTelemetry) {
                state.analysis.samples.push({ ...state.currentLiveTelemetry });
            }

            await new Promise(r => setTimeout(r, 700));
        }

        playAnalysisCompleteChime();

        // Stabilize averages from samples
        const samples = state.analysis.samples;
        let avgTds = 0;
        let avgTemp = 25.0;
        let avgRawV = 0.0;
        let avgRawAdc = 0;

        if (samples.length > 0) {
            avgTds = samples.reduce((acc, s) => acc + (typeof s.tds_ppm === 'number' ? s.tds_ppm : 0), 0) / samples.length;
            avgTemp = samples.reduce((acc, s) => acc + (typeof s.temp_c === 'number' ? s.temp_c : 25), 0) / samples.length;
            avgRawV = samples.reduce((acc, s) => {
                const v = typeof s.tds_raw_v === 'number' ? s.tds_raw_v : (typeof s.raw_v === 'number' ? s.raw_v : 0);
                return acc + v;
            }, 0) / samples.length;
            avgRawAdc = Math.round(samples.reduce((acc, s) => {
                const a = typeof s.tds_raw_adc === 'number' ? s.tds_raw_adc : (typeof s.raw_adc === 'number' ? s.raw_adc : 0);
                return acc + a;
            }, 0) / samples.length);
        } else if (state.currentLiveTelemetry) {
            avgTds = state.currentLiveTelemetry.tds_ppm || 0;
            avgTemp = state.currentLiveTelemetry.temp_c || 25;
            avgRawV = (typeof state.currentLiveTelemetry.tds_raw_v === 'number') ? state.currentLiveTelemetry.tds_raw_v : (state.currentLiveTelemetry.raw_v || 0);
            avgRawAdc = (typeof state.currentLiveTelemetry.tds_raw_adc === 'number') ? state.currentLiveTelemetry.tds_raw_adc : (state.currentLiveTelemetry.raw_adc || 0);
        }

        const snapshot = {
            tds_ppm: parseFloat(avgTds.toFixed(1)),
            temp_c: parseFloat(avgTemp.toFixed(1)),
            raw_v: parseFloat(avgRawV.toFixed(3)),
            raw_adc: avgRawAdc,
            tds_raw_v: parseFloat(avgRawV.toFixed(3)),
            tds_raw_adc: avgRawAdc,
            ec_us_cm: Math.round(avgTds * 2),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            tds_status: (samples.length > 0 && samples[0].tds_status) ? samples[0].tds_status : 'ok',
            temp_status: (samples.length > 0 && samples[0].temp_status) ? samples[0].temp_status : 'ok',
            isDemo: state.mode === 'demo'
        };

        state.analysis.snapshot = snapshot;
        state.analysis.status = 'completed';

        renderAnalysisVerdict(snapshot);

        if (elements.hubRunningView) elements.hubRunningView.style.display = 'none';
        if (elements.hubResultView) elements.hubResultView.style.display = 'block';

        elements.hubResultView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Water sample analysis complete! Official verdict generated.', 'success');
    }

    function renderAnalysisVerdict(data) {
        if (!elements.hubVerdictBanner) return;

        const rawV = (typeof data.tds_raw_v === 'number') ? data.tds_raw_v : ((typeof data.raw_v === 'number') ? data.raw_v : null);
        const rawAdc = (typeof data.tds_raw_adc === 'number') ? data.tds_raw_adc : ((typeof data.raw_adc === 'number') ? data.raw_adc : null);
        const isSensorAir = (!data.isDemo && ((rawV !== null && rawV < 0.005) || (data.tds_ppm === 0 && (rawAdc === null || rawAdc <= 5))));
        const ppm = typeof data.tds_ppm === 'number' ? data.tds_ppm : 0;
        const temp = typeof data.temp_c === 'number' ? data.temp_c : 25;
        const ec = typeof data.ec_us_cm === 'number' ? data.ec_us_cm : Math.round(ppm * 2);

        // Update Snapshot Bar
        if (elements.snapTds) elements.snapTds.textContent = `${Math.round(ppm)} ppm`;
        if (elements.snapTemp) elements.snapTemp.textContent = `${temp.toFixed(1)} °C`;
        if (elements.snapEc) elements.snapEc.textContent = `${ec} µS/cm`;
        if (elements.snapTimestamp) elements.snapTimestamp.textContent = data.timestamp || new Date().toLocaleTimeString();

        if (isSensorAir) {
            elements.hubVerdictBanner.className = 'hub-verdict-banner banner-neutral';
            elements.verdictBannerIcon.textContent = '⚪';
            elements.verdictBannerHeadline.textContent = 'No Water Sample Detected';
            elements.verdictBannerExplanation.textContent = 'Sensor readings indicate open air contact (0 ppm / 0.000 V). Please submerge both the TDS probe and temperature sensor into your water sample and click "Analyze Another Water Sample" below to repeat the test.';
            elements.verdictPotabilityPill.className = 'verdict-pill pill-warning';
            elements.verdictPotabilityPill.textContent = 'Probe Dry (Unsubmerged)';
            elements.verdictPalatabilityPill.className = 'verdict-pill pill-rating';
            elements.verdictPalatabilityPill.textContent = 'Air Baseline';

            setTileState('drinking', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to evaluate drinking safety.');
            setTileState('cooking', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to check cooking suitability.');
            setTileState('bathing', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to assess bathing and hygiene.');
            setTileState('laundry', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to analyze laundry lather.');
            setTileState('cleaning', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to check surface cleaning.');
            setTileState('gardening', 'Pending Submergence', 'badge-conditional', 'Submerge probe into water to test irrigation salinity.');
        } else if (ppm <= 300) {
            elements.hubVerdictBanner.className = 'hub-verdict-banner banner-safe';
            elements.verdictBannerIcon.textContent = '✅';
            elements.verdictBannerHeadline.textContent = 'Water is Safe to Consume (Excellent Potability)';
            elements.verdictBannerExplanation.textContent = `TDS level (${Math.round(ppm)} ppm) is within the Bureau of Indian Standards (BIS IS 10500:2012) acceptable limit (≤ 500 mg/L) and meets WHO guidelines for optimum drinking palatability. Highly recommended for direct consumption, beverages, and all domestic culinary uses.`;
            elements.verdictPotabilityPill.className = 'verdict-pill pill-potable';
            elements.verdictPotabilityPill.textContent = 'Potable (Safe to Drink)';
            elements.verdictPalatabilityPill.className = 'verdict-pill pill-rating';
            elements.verdictPalatabilityPill.textContent = (ppm < 50) ? 'Pure / Demineralized' : 'Excellent Taste';

            setTileState('drinking', 'Safe (YES)', 'badge-yes', 'Mineral content is optimal for human hydration; crisp, pleasant palatability.');
            setTileState('cooking', 'Safe (YES)', 'badge-yes', 'Ideal for food preparation, boiling, tea, and coffee; preserves natural culinary flavors.');
            setTileState('bathing', 'Suitable (YES)', 'badge-yes', 'Gentle on skin and scalp; creates rich soap lather and rinses cleanly.');
            setTileState('laundry', 'Suitable (YES)', 'badge-yes', 'Maximizes detergent efficiency, keeps fabrics soft, and avoids machine limescale.');
            setTileState('cleaning', 'Suitable (YES)', 'badge-yes', 'Dries spot-free on glassware, bathroom tiles, and chrome fixtures.');
            setTileState('gardening', 'Suitable (YES)', 'badge-yes', 'Healthy hydration for all indoor houseplants, flowers, and sensitive herbs.');
        } else if (ppm <= 500) {
            elements.hubVerdictBanner.className = 'hub-verdict-banner banner-safe';
            elements.verdictBannerIcon.textContent = '✅';
            elements.verdictBannerHeadline.textContent = 'Water is Safe to Consume (Standard Tap Water)';
            elements.verdictBannerExplanation.textContent = `TDS level (${Math.round(ppm)} ppm) complies with the BIS IS 10500:2012 acceptable reference limit (≤ 500 mg/L). Palatability is rated Good. Completely safe for direct daily drinking and normal household consumption.`;
            elements.verdictPotabilityPill.className = 'verdict-pill pill-potable';
            elements.verdictPotabilityPill.textContent = 'Potable (Safe to Drink)';
            elements.verdictPalatabilityPill.className = 'verdict-pill pill-rating';
            elements.verdictPalatabilityPill.textContent = 'Good Palatability';

            setTileState('drinking', 'Safe (YES)', 'badge-yes', 'Within Indian national standard acceptable limits; safe for direct daily consumption.');
            setTileState('cooking', 'Safe (YES)', 'badge-yes', 'Suitable for daily culinary use, boiling, and beverage preparation.');
            setTileState('bathing', 'Suitable (YES)', 'badge-yes', 'Standard domestic hardness; produces normal soap lather without skin irritation.');
            setTileState('laundry', 'Suitable (YES)', 'badge-yes', 'Normal detergent requirement; safe for washing machines and linens.');
            setTileState('cleaning', 'Suitable (YES)', 'badge-yes', 'Suitable for mopping and dishwashing with minimal water spotting.');
            setTileState('gardening', 'Suitable (YES)', 'badge-yes', 'Provides essential trace minerals for lawns, garden beds, and outdoor plants.');
        } else if (ppm <= 2000) {
            elements.hubVerdictBanner.className = 'hub-verdict-banner banner-warning';
            elements.verdictBannerIcon.textContent = '🟡';
            elements.verdictBannerHeadline.textContent = 'Conditionally Safe (Treatment Recommended)';
            elements.verdictBannerExplanation.textContent = `TDS level (${Math.round(ppm)} ppm) exceeds the acceptable limit (500 mg/L) but is within the BIS permissible limit in absence of alternate sources (up to 2000 mg/L). While usable in emergencies, domestic boiling or RO filtration is recommended to reduce hardness and improve palatability.`;
            elements.verdictPotabilityPill.className = 'verdict-pill pill-warning';
            elements.verdictPotabilityPill.textContent = 'Conditionally Potable';
            elements.verdictPalatabilityPill.className = 'verdict-pill pill-warning';
            elements.verdictPalatabilityPill.textContent = 'Fair to Poor Taste';

            setTileState('drinking', 'Filtration Advised', 'badge-conditional', 'Noticeable mineral/saline aftertaste. Domestic RO or carbon filtration recommended.');
            setTileState('cooking', 'Boiling Advised', 'badge-conditional', 'Boil before culinary use. Minerals may slightly cloud tea or affect subtle seasonings.');
            setTileState('bathing', 'Moderate Hardness', 'badge-conditional', 'Requires more soap/shampoo to lather; may cause mild skin dryness over prolonged use.');
            setTileState('laundry', 'Extra Soap Needed', 'badge-conditional', 'Calcium and magnesium bind detergents; may gradually stiffen fabric fibers.');
            setTileState('cleaning', 'Mild Spotting', 'badge-conditional', 'Leaves faint white mineral haze on glassware and bathroom shower glass.');
            setTileState('gardening', 'Hardy Plants Only', 'badge-conditional', 'Suitable for established outdoor shrubs and trees; avoid for salt-sensitive seedlings.');
        } else {
            elements.hubVerdictBanner.className = 'hub-verdict-banner banner-danger';
            elements.verdictBannerIcon.textContent = '❌';
            elements.verdictBannerHeadline.textContent = 'UNSAFE TO CONSUME - DO NOT DRINK';
            elements.verdictBannerExplanation.textContent = `TDS level (${Math.round(ppm)} ppm) exceeds the maximum permissible limit of 2000 mg/L under BIS IS 10500:2012. Strictly prohibited for drinking or food preparation. High mineral concentration can cause digestive irritation and kidney strain. Restricted to non-potable domestic use.`;
            elements.verdictPotabilityPill.className = 'verdict-pill pill-danger';
            elements.verdictPotabilityPill.textContent = 'Non-Potable (Unsafe)';
            elements.verdictPalatabilityPill.className = 'verdict-pill pill-danger';
            elements.verdictPalatabilityPill.textContent = 'Unacceptable Taste';

            setTileState('drinking', 'UNSAFE (NO)', 'badge-no', 'Prohibited for direct drinking. High mineral density violates health standards.');
            setTileState('cooking', 'UNSAFE (NO)', 'badge-no', 'Do not use for food or beverages; boiling further concentrates dangerous salt levels.');
            setTileState('bathing', 'Harsh (NO)', 'badge-no', 'Excessive mineral hardness strips skin moisture and prevents proper soap lather.');
            setTileState('laundry', 'Scaling Hazard (NO)', 'badge-no', 'Severe limescale accumulation damages washing machine heating coils.');
            setTileState('cleaning', 'Staining Risk (NO)', 'badge-no', 'Leaves heavy chalky mineral rings and deposits on tiles, sinks, and toilets.');
            setTileState('gardening', 'Salinity Hazard (NO)', 'badge-no', 'High osmotic salinity burns plant root tips and causes leaf yellowing.');
        }

        evaluateWaterUsability(data);
        updateBisAssessmentSection(data);
    }

    function setTileState(id, badgeText, badgeClass, descText) {
        const key = id.charAt(0).toUpperCase() + id.slice(1);
        const badgeElem = elements[`tileBadge${key}`];
        const descElem = elements[`tileDesc${key}`];
        if (badgeElem) {
            badgeElem.className = `tile-verdict-badge ${badgeClass}`;
            badgeElem.textContent = badgeText;
        }
        if (descElem) {
            descElem.textContent = descText;
        }
    }

    function resetWaterAnalysis() {
        state.analysis.status = 'idle';
        state.analysis.samples = [];
        state.analysis.snapshot = null;

        if (elements.hubRunningView) elements.hubRunningView.style.display = 'none';
        if (elements.hubResultView) elements.hubResultView.style.display = 'none';
        if (elements.hubIdleView) elements.hubIdleView.style.display = 'block';

        elements.hubIdleView.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Ready for new water sample. Submerge probe and click Start.', 'info');
    }

    function playAnalysisCompleteChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.1, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.15);
            gain2.gain.setValueAtTime(0.1, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.55);
        } catch (e) {}
    }

    // ==========================================================================
    // Actionable Water Usability & Health Assessment Engine
    // Evaluates: Direct Drinking, Boiling/Cooking, and Household Works
    // ==========================================================================
    function evaluateWaterUsability(data) {
        if (!elements.verdictMasterCard) return;

        const rawV = (typeof data.tds_raw_v === 'number') ? data.tds_raw_v : ((typeof data.raw_v === 'number') ? data.raw_v : null);
        const rawAdc = (typeof data.tds_raw_adc === 'number') ? data.tds_raw_adc : ((typeof data.raw_adc === 'number') ? data.raw_adc : null);
        const isSensorAir = (!data.isDemo && ((rawV !== null && rawV < 0.005) || (data.tds_ppm === 0 && (rawAdc === null || rawAdc <= 5))));
        const isFault = (data.tds_status !== 'ok');
        const ppm = typeof data.tds_ppm === 'number' ? data.tds_ppm : 0;

        // Reset state classes on master card
        elements.verdictMasterCard.className = 'verdict-master-card';

        // State 1: Sensor in Open Air (Probe Dry)
        if (isSensorAir) {
            elements.verdictMasterCard.classList.add('state-neutral');
            elements.verdictOverallIcon.textContent = '💧';
            elements.verdictOverallTitle.textContent = 'Sensor in Open Air (Probe Dry)';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-neutral';
            elements.verdictOverallBadge.textContent = 'Awaiting Sample';
            elements.verdictOverallDesc.textContent = 'The TDS probe is dry or in open air (<0.005 V). Submerge both the TDS probe and DS18B20 temperature sensor into your water sample to generate a live verdict.';

            // Direct Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-neutral';
            elements.verdictDrinkingStatus.textContent = '⏳ Standby';
            elements.verdictDrinkingDesc.textContent = 'Submerge sensor into the water sample to test potability and mineral safety.';
            elements.verdictDrinkingTip.innerHTML = '<span>WHO Target: 50 – 300 ppm (Ideal palatability & health)</span>';

            // Boiling
            elements.verdictBoilingStatus.className = 'verdict-pill pill-neutral';
            elements.verdictBoilingStatus.textContent = '⏳ Standby';
            elements.verdictBoilingDesc.textContent = 'Submerge sensor to verify whether thermal boiling is appropriate for consumption.';
            elements.verdictBoilingTip.innerHTML = '<span>Note: Boiling sterilizes bacteria but does not eliminate minerals.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-neutral';
            elements.verdictHouseholdStatus.textContent = '⏳ Standby';
            elements.verdictHouseholdDesc.textContent = 'Submerge sensor to evaluate laundry lather, appliance scaling, and plumbing safety.';
            elements.verdictHouseholdTip.innerHTML = '<span>Evaluates soap lather, fabric wear, and heater life.</span>';
            return;
        }

        // State 2: Sensor Diagnostic Fault
        if (isFault) {
            elements.verdictMasterCard.classList.add('state-danger');
            elements.verdictOverallIcon.textContent = '⚠️';
            elements.verdictOverallTitle.textContent = 'Sensor Diagnostic Alert';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-danger';
            elements.verdictOverallBadge.textContent = 'Sensor Error';
            elements.verdictOverallDesc.textContent = 'Hardware returned an out-of-range ADC reading. Check TDS probe connections and verify 3.3V power rails.';
            return;
        }

        // State 3: Demineralized / Highly Purified (TDS < 50 ppm)
        if (ppm < 50) {
            elements.verdictMasterCard.classList.add('state-optimal');
            elements.verdictOverallIcon.textContent = '✨';
            elements.verdictOverallTitle.textContent = 'Demineralized / Highly Purified Water (RO / Distilled)';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-optimal';
            elements.verdictOverallBadge.textContent = 'Safe & Purified';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, this water has ultra-low dissolved solids, characteristic of Reverse Osmosis (RO) or distillation. It is clean, non-toxic, and creates zero limescale.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-optimal';
            elements.verdictDrinkingStatus.textContent = '✅ Suitable for Drinking';
            elements.verdictDrinkingDesc.textContent = 'Clean and free of excess minerals. Because natural minerals have been removed, taste may feel flat or slightly acidic.';
            elements.verdictDrinkingTip.innerHTML = '<span>Hydration: Completely safe to drink daily. Mineral filters add trace minerals for taste.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-optimal';
            elements.verdictBoilingStatus.textContent = '⭐ Excellent for Boiling';
            elements.verdictBoilingDesc.textContent = 'Ideal for boiling, tea, coffee, soups, and baby food. Leaves zero limescale or calcium crust on electric kettles and cookware.';
            elements.verdictBoilingTip.innerHTML = '<span>Zero Scaling: 100% protection for kettle heating elements and cookware.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-optimal';
            elements.verdictHouseholdStatus.textContent = '⭐ Optimal for Household';
            elements.verdictHouseholdDesc.textContent = 'Superb for laundry, dishwashing, and bathing. Creates rich, creamy soap lather with minimal detergent and leaves glassware spotless.';
            elements.verdictHouseholdTip.innerHTML = '<span>Protects Appliances: Prolongs lifespan of washing machines and water geysers.</span>';
        }
        // State 4: Optimal Mineral Drinking Water (TDS 50 - 300 ppm)
        else if (ppm <= 300) {
            elements.verdictMasterCard.classList.add('state-optimal');
            elements.verdictOverallIcon.textContent = '💧';
            elements.verdictOverallTitle.textContent = 'Optimal Natural Drinking & Household Water';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-optimal';
            elements.verdictOverallBadge.textContent = 'Excellent Quality';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, this water meets the gold standard drinking range established by the World Health Organization (WHO) and Indian Standards (IS 10500). Fresh taste, safe minerals, and highly versatile.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-optimal';
            elements.verdictDrinkingStatus.textContent = '⭐ Prime Drinking Water';
            elements.verdictDrinkingDesc.textContent = 'Excellent for direct drinking. Delivers balanced hydration with natural trace calcium and magnesium electrolytes, with a fresh, crisp taste.';
            elements.verdictDrinkingTip.innerHTML = '<span>Gold Standard: Meets WHO 50–300 ppm optimal drinking water benchmark.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-optimal';
            elements.verdictBoilingStatus.textContent = '✅ Safe & Ideal for Boiling';
            elements.verdictBoilingDesc.textContent = 'Safe and recommended for all cooking, beverages, and boiling. Heat eliminates biological microbes while retaining natural minerals.';
            elements.verdictBoilingTip.innerHTML = '<span>Cookware Safe: Minimal mineral residue; standard heat treatment cleanses microbes.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-optimal';
            elements.verdictHouseholdStatus.textContent = '✅ Excellent for Household';
            elements.verdictHouseholdDesc.textContent = 'Gentle on skin, hair, and fabrics. Perfect for showering, washing clothes, kitchen cleanup, and watering indoor and garden plants.';
            elements.verdictHouseholdTip.innerHTML = '<span>No Plumbing Wear: Gentle on pipes, brass taps, and household appliances.</span>';
        }
        // State 5: Acceptable Tap Water (TDS 300 - 600 ppm)
        else if (ppm <= 600) {
            elements.verdictMasterCard.classList.add('state-acceptable');
            elements.verdictOverallIcon.textContent = '🚰';
            elements.verdictOverallTitle.textContent = 'Acceptable Tap & Domestic Supply Water';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-acceptable';
            elements.verdictOverallBadge.textContent = 'Acceptable Quality';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, this is standard municipal tap or groundwater. Fully acceptable for all domestic chores and drinkable if biologically clean.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-acceptable';
            elements.verdictDrinkingStatus.textContent = '✅ Acceptable for Drinking';
            elements.verdictDrinkingDesc.textContent = 'Acceptable for daily consumption. Water tastes slightly heavier due to minerals. If sourced from a tank or borewell, basic UV/candle filtration is advised.';
            elements.verdictDrinkingTip.innerHTML = '<span>Within Safe Limits: Below the 500–600 ppm acceptable drinking threshold.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-optimal';
            elements.verdictBoilingStatus.textContent = '✅ Safe for Boiling';
            elements.verdictBoilingDesc.textContent = 'Safe for boiling and routine cooking. Periodic descaling of electric kettles may be needed due to moderate calcium content.';
            elements.verdictBoilingTip.innerHTML = '<span>Sterilization: 3–5 min rolling boil eliminates any seasonal bacteria.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-optimal';
            elements.verdictHouseholdStatus.textContent = '✅ Fully Usable for Household';
            elements.verdictHouseholdDesc.textContent = 'Well suited for showering, laundry, dishwashing, house cleaning, and garden irrigation. Soaps lather normally.';
            elements.verdictHouseholdTip.innerHTML = '<span>Good Domestic Grade: Safe for plumbing and domestic washing machines.</span>';
        }
        // State 6: High Mineral Hard Water (TDS 600 - 900 ppm)
        else if (ppm <= 900) {
            elements.verdictMasterCard.classList.add('state-warning');
            elements.verdictOverallIcon.textContent = '⚠️';
            elements.verdictOverallTitle.textContent = 'High Mineral Hard Water (Filtration Advised)';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-warning';
            elements.verdictOverallBadge.textContent = 'Fair / Hard Water';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, this water has elevated mineral hardness. RO or membrane filtration is strongly recommended before drinking. Usable for general cleaning and outdoor chores.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-warning';
            elements.verdictDrinkingStatus.textContent = '⚠️ Filter Before Drinking';
            elements.verdictDrinkingDesc.textContent = 'Poor palatability with a noticeable mineral, chalky, or saline taste. Prolonged direct drinking may stress kidney filtration. RO filtration recommended.';
            elements.verdictDrinkingTip.innerHTML = '<span>Treatment Needed: Use an RO purifier to reduce TDS down to 100–250 ppm.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-warning';
            elements.verdictBoilingStatus.textContent = '⚠️ Boiling Alone Insufficient';
            elements.verdictBoilingDesc.textContent = 'Boiling destroys microbes but evaporates pure steam, CONCENTRATING the mineral load further. Leaves white crust in pots. Do not use for baby formula.';
            elements.verdictBoilingTip.innerHTML = '<span>Boiling Warning: Boiling does not remove dissolved minerals or heavy salts.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-acceptable';
            elements.verdictHouseholdStatus.textContent = '✅ Usable for General Works';
            elements.verdictHouseholdDesc.textContent = 'Usable for floor mopping, toilet flushing, and cleaning. Requires extra detergent for laundry and can leave soap scum on bathroom tiles.';
            elements.verdictHouseholdTip.innerHTML = '<span>Scaling Alert: Water heaters and geysers may accumulate limescale over time.</span>';
        }
        // State 7: Very Hard Water (TDS 900 - 1200 ppm)
        else if (ppm <= 1200) {
            elements.verdictMasterCard.classList.add('state-danger');
            elements.verdictOverallIcon.textContent = '🚫';
            elements.verdictOverallTitle.textContent = 'Very Hard Water — Unfit for Direct Consumption';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-danger';
            elements.verdictOverallBadge.textContent = 'Unfit to Drink';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, the water exceeds recommended palatability and safety boundaries. Do not drink directly. Suitable only for basic utility and flushing.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-danger';
            elements.verdictDrinkingStatus.textContent = '❌ Unfit for Drinking';
            elements.verdictDrinkingDesc.textContent = 'Do NOT drink directly. High mineral density may cause stomach upset, dehydration, or gastrointestinal irritation. Requires heavy-duty RO purification.';
            elements.verdictDrinkingTip.innerHTML = '<span>Health Alert: Exceeds standard potable palatability limit of 500 ppm.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-danger';
            elements.verdictBoilingStatus.textContent = '❌ Do Not Boil for Food';
            elements.verdictBoilingDesc.textContent = 'Unsuitable for cooking or boiling for consumption. Evaporation thickens the mineral salts and alters food taste and texture.';
            elements.verdictBoilingTip.innerHTML = '<span>Strict Notice: Boiling concentrates dissolved solids. Do not consume.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-warning';
            elements.verdictHouseholdStatus.textContent = '⚠️ Restricted Household Works';
            elements.verdictHouseholdDesc.textContent = 'Use only for outdoor floor washing and toilet flushing. In laundry, clothes will stiffen and soap will not lather. Causes heavy scaling in geysers.';
            elements.verdictHouseholdTip.innerHTML = '<span>Plumbing Risk: High risk of clogging water heaters and pipe calcification.</span>';
        }
        // State 8: Hazardous / Excessive Saline Contamination (TDS > 1200 ppm)
        else {
            elements.verdictMasterCard.classList.add('state-danger');
            elements.verdictOverallIcon.textContent = '⛔';
            elements.verdictOverallTitle.textContent = 'Severe Mineral Contamination / Saline Water';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-danger';
            elements.verdictOverallBadge.textContent = 'Hazardous Water';
            elements.verdictOverallDesc.textContent = `At ${Math.round(ppm)} ppm, this water exceeds maximum permissible limits (IS 10500 / WHO). Dangerous for human consumption and damaging to plumbing.`;

            // Drinking
            elements.verdictDrinkingStatus.className = 'verdict-pill pill-danger';
            elements.verdictDrinkingStatus.textContent = '⛔ Strictly Prohibited';
            elements.verdictDrinkingDesc.textContent = 'Dangerous for drinking. Severe mineral/saline content can cause adverse physiological reactions.';
            elements.verdictDrinkingTip.innerHTML = '<span>Danger: Completely unfit for human consumption.</span>';

            // Boiling & Cooking
            elements.verdictBoilingStatus.className = 'verdict-pill pill-danger';
            elements.verdictBoilingStatus.textContent = '⛔ Unsafe for Cooking';
            elements.verdictBoilingDesc.textContent = 'Never boil or prepare food with this water. Severe mineral concentration occurs.';
            elements.verdictBoilingTip.innerHTML = '<span>Hazard: Heavy mineral crusting occurs instantly upon boiling.</span>';

            // Household
            elements.verdictHouseholdStatus.className = 'verdict-pill pill-danger';
            elements.verdictHouseholdStatus.textContent = '⛔ Damaging to Plumbing';
            elements.verdictHouseholdDesc.textContent = 'Will corrode metal pipes, damage washing machine solenoids, and destroy water heater elements. Use strictly for basic drain flushing.';
            elements.verdictHouseholdTip.innerHTML = '<span>Appliance Damage: High salinity/mineral content causes severe corrosion.</span>';
        }
    }

    function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    // ==========================================================================
    // AQUASENSE – WATER QUALITY RESULTS & BIS IS 10500 REFERENCE COMPARISON ENGINE
    // ==========================================================================
    function updateBisAssessmentSection(data) {
        if (!elements.bisProminentResultCard) return;

        const hasTdsNumber = (typeof data.tds_ppm === 'number' && !isNaN(data.tds_ppm));
        const hasTempNumber = (typeof data.temp_c === 'number' && !isNaN(data.temp_c));
        const isOffline = (data.tds_status === 'error' && data.temp_status === 'disconnected') || (!hasTdsNumber && !hasTempNumber);
        const ppm = hasTdsNumber ? data.tds_ppm : null;
        const temp = (hasTempNumber && data.temp_status !== 'disconnected') ? data.temp_c : null;
        const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. Automatic Live Sensor Telemetry Results Bar
        if (elements.bisMetaTds) {
            elements.bisMetaTds.textContent = (ppm !== null) ? `${Math.round(ppm)} ppm` : '-- ppm';
        }
        if (elements.bisMetaTemp) {
            elements.bisMetaTemp.textContent = (temp !== null) ? `${temp.toFixed(1)} °C` : '-- °C';
        }
        if (elements.bisMetaTimestamp) {
            elements.bisMetaTimestamp.textContent = nowLabel;
        }
        if (elements.bisMetaSensorStatus) {
            if (data.isDemo) {
                elements.bisMetaSensorStatus.className = 'status-indicator-chip chip-simulated';
                elements.bisMetaSensorStatus.textContent = 'Simulated Data';
            } else if (isOffline) {
                elements.bisMetaSensorStatus.className = 'status-indicator-chip chip-neutral';
                elements.bisMetaSensorStatus.textContent = 'Hardware Offline';
            } else {
                elements.bisMetaSensorStatus.className = 'status-indicator-chip chip-optimal';
                elements.bisMetaSensorStatus.textContent = 'Live ESP32 Online';
            }
        }

        // Tables Actual Values - Strictly Real Sensor Telemetry
        if (elements.cmpTableTds) {
            elements.cmpTableTds.textContent = (ppm !== null) ? `${Math.round(ppm)} ppm` : '-- ppm';
        }
        if (elements.refTableTdsVal) {
            elements.refTableTdsVal.textContent = (ppm !== null) ? `${Math.round(ppm)} ppm` : '-- ppm';
        }
        if (elements.cmpTableTemp) {
            elements.cmpTableTemp.textContent = (temp !== null) ? `${temp.toFixed(1)} °C` : '-- °C';
        }
        if (elements.refTableTempVal) {
            elements.refTableTempVal.textContent = (temp !== null) ? `${temp.toFixed(1)} °C` : '-- °C';
        }

        // Temperature comparison result pill
        if (elements.cmpTableTempResult) {
            if (temp !== null) {
                if (temp >= 15.0 && temp <= 35.0) {
                    elements.cmpTableTempResult.className = 'badge-pill pill-info';
                    elements.cmpTableTempResult.textContent = 'Normal Ambient (20–30°C)';
                } else if (temp > 35.0) {
                    elements.cmpTableTempResult.className = 'badge-pill pill-warning';
                    elements.cmpTableTempResult.textContent = 'Elevated Thermal Level';
                } else {
                    elements.cmpTableTempResult.className = 'badge-pill pill-info';
                    elements.cmpTableTempResult.textContent = 'Chilled Thermal Level';
                }
            } else {
                elements.cmpTableTempResult.className = 'badge-pill pill-neutral';
                elements.cmpTableTempResult.textContent = 'Sensor Disconnected';
            }
        }

        // 2. Assess TDS Classification & Update Prominent Card
        // State D: UNABLE TO ASSESS
        if (ppm === null) {
            elements.bisProminentResultCard.className = 'bis-result-card state-neutral';
            elements.bisResultIcon.textContent = '⚠️';
            elements.bisResultTitle.textContent = 'Unable to Assess Water Quality';
            elements.bisResultBadge.className = 'bis-status-badge badge-neutral';
            elements.bisResultBadge.textContent = 'Unable to Assess';
            elements.bisResultMessage.textContent = 'Valid sensor readings are unavailable. Please check the ESP32 connection and repeat the measurement.';

            if (elements.bisMetaPrelimBadge) {
                elements.bisMetaPrelimBadge.className = 'status-indicator-chip chip-neutral';
                elements.bisMetaPrelimBadge.textContent = 'Unable to Assess';
            }
            if (elements.cmpTableTdsResult) {
                elements.cmpTableTdsResult.className = 'badge-pill pill-neutral';
                elements.cmpTableTdsResult.textContent = 'Awaiting Telemetry';
            }

            updateBisSpectrumPin(0);
            updateBisHouseholdUsage(null);
            return;
        }

        // State A: TDS WITHIN ACCEPTABLE LIMIT (<= 500 mg/L)
        if (ppm <= 500) {
            elements.bisProminentResultCard.className = 'bis-result-card state-acceptable';
            elements.bisResultIcon.textContent = '✅';
            elements.bisResultTitle.textContent = `TDS Within BIS Acceptable Limit (${Math.round(ppm)} ppm)`;
            elements.bisResultBadge.className = 'bis-status-badge badge-acceptable';
            elements.bisResultBadge.textContent = 'Within Acceptable Limit';
            elements.bisResultMessage.textContent = 'Your measured TDS is within the BIS acceptable reference limit. However, other important drinking-water parameters have not been tested.';

            if (elements.bisMetaPrelimBadge) {
                elements.bisMetaPrelimBadge.className = 'status-indicator-chip chip-optimal';
                elements.bisMetaPrelimBadge.textContent = 'Within Acceptable Limit';
            }
            if (elements.cmpTableTdsResult) {
                elements.cmpTableTdsResult.className = 'badge-pill pill-optimal';
                elements.cmpTableTdsResult.textContent = 'Within acceptable reference limit';
            }

            updateBisSpectrumPin(ppm);
            updateBisHouseholdUsage(ppm);
        }
        // State B: TDS ABOVE ACCEPTABLE LIMIT (500 < TDS <= 2000 mg/L)
        else if (ppm <= 2000) {
            elements.bisProminentResultCard.className = 'bis-result-card state-permissible';
            elements.bisResultIcon.textContent = '⚠️';
            elements.bisResultTitle.textContent = `TDS Above Acceptable Limit (${Math.round(ppm)} ppm)`;
            elements.bisResultBadge.className = 'bis-status-badge badge-permissible';
            elements.bisResultBadge.textContent = 'Permissible Limit (No Alternate Source)';
            elements.bisResultMessage.textContent = 'Your measured TDS exceeds the acceptable limit. Further investigation and water-quality testing are recommended.';

            if (elements.bisMetaPrelimBadge) {
                elements.bisMetaPrelimBadge.className = 'status-indicator-chip chip-warning';
                elements.bisMetaPrelimBadge.textContent = 'Above Acceptable (Permissible)';
            }
            if (elements.cmpTableTdsResult) {
                elements.cmpTableTdsResult.className = 'badge-pill pill-warning';
                elements.cmpTableTdsResult.textContent = 'Above acceptable limit but within the permissible limit in the absence of an alternate source';
            }

            updateBisSpectrumPin(ppm);
            updateBisHouseholdUsage(ppm);
        }
        // State C: TDS EXCEEDS PERMISSIBLE LIMIT (> 2000 mg/L)
        else {
            elements.bisProminentResultCard.className = 'bis-result-card state-excess';
            elements.bisResultIcon.textContent = '🚫';
            elements.bisResultTitle.textContent = `TDS Exceeds Permissible Limit (${Math.round(ppm)} ppm)`;
            elements.bisResultBadge.className = 'bis-status-badge badge-excess';
            elements.bisResultBadge.textContent = 'Exceeds Permissible Limit';
            elements.bisResultMessage.textContent = 'Your measured TDS exceeds the permissible limit. Do not consider this water suitable for drinking based on the available assessment. Seek alternative verified drinking water and arrange proper testing.';

            if (elements.bisMetaPrelimBadge) {
                elements.bisMetaPrelimBadge.className = 'status-indicator-chip chip-danger';
                elements.bisMetaPrelimBadge.textContent = 'Exceeds Permissible Limit';
            }
            if (elements.cmpTableTdsResult) {
                elements.cmpTableTdsResult.className = 'badge-pill pill-danger';
                elements.cmpTableTdsResult.textContent = 'Exceeds the permissible limit';
            }

            updateBisSpectrumPin(ppm);
            updateBisHouseholdUsage(ppm);
        }
    }

    // Dynamic Spectrum Pin Positioning
    function updateBisSpectrumPin(ppm) {
        if (!elements.bisSpectrumPin || !elements.bisSpectrumPinLabel) return;
        const val = Math.max(0, ppm || 0);
        let percent = 0;

        if (val <= 500) {
            // Zone 1: 0 to 500 maps to 0% - 35%
            percent = (val / 500) * 35;
        } else if (val <= 2000) {
            // Zone 2: 500 to 2000 maps to 35% - 75%
            percent = 35 + ((val - 500) / 1500) * 40;
        } else {
            // Zone 3: 2000 to 3000 maps to 75% - 98%
            percent = 75 + (Math.min(val - 2000, 1000) / 1000) * 23;
        }

        percent = Math.max(2, Math.min(98, percent));
        elements.bisSpectrumPin.style.left = `${percent}%`;
        elements.bisSpectrumPinLabel.textContent = `${Math.round(val)} ppm`;
    }

    // Household Water Usage Guidance Updates
    function updateBisHouseholdUsage(ppm) {
        if (!elements.appStatusDrinking) return;

        if (ppm === null) {
            const apps = [
                { s: elements.appStatusDrinking, d: elements.appDescDrinking, def: 'Awaiting sensor telemetry to evaluate palatability and culinary extraction.' },
                { s: elements.appStatusBathing, d: elements.appDescBathing, def: 'Awaiting sensor telemetry to assess soap lathering and skin hydration.' },
                { s: elements.appStatusLaundry, d: elements.appDescLaundry, def: 'Awaiting sensor telemetry to analyze detergent efficiency and fabric wear.' },
                { s: elements.appStatusCleaning, d: elements.appDescCleaning, def: 'Awaiting sensor telemetry to evaluate surface residue and glass spotting.' },
                { s: elements.appStatusGardening, d: elements.appDescGardening, def: 'Awaiting sensor telemetry to check plant salinity tolerance and soil osmosis.' }
            ];
            apps.forEach(a => {
                if (a.s) { a.s.className = 'app-status-badge badge-neutral'; a.s.textContent = 'Standby'; }
                if (a.d) { a.d.textContent = a.def; }
            });
            return;
        }

        if (ppm <= 500) {
            // Drinking & Cooking
            elements.appStatusDrinking.className = 'app-status-badge badge-acceptable';
            elements.appStatusDrinking.textContent = 'Acceptable (≤ 500)';
            elements.appDescDrinking.textContent = 'Mineral concentration is within the BIS acceptable threshold. Excellent culinary extraction for tea and cooking. Microbiological testing required for confirmed potability.';

            // Bathing
            elements.appStatusBathing.className = 'app-status-badge badge-acceptable';
            elements.appStatusBathing.textContent = 'Optimal';
            elements.appDescBathing.textContent = 'Produces a smooth, rich soap lather. Easily rinses clean, protecting the natural skin barrier and keeping hair soft.';

            // Laundry
            elements.appStatusLaundry.className = 'app-status-badge badge-acceptable';
            elements.appStatusLaundry.textContent = 'Optimal';
            elements.appDescLaundry.textContent = 'Detergents perform at peak surfactant efficiency. Clothes remain soft and vibrant without gray mineral crusting.';

            // Cleaning
            elements.appStatusCleaning.className = 'app-status-badge badge-acceptable';
            elements.appStatusCleaning.textContent = 'Spotless';
            elements.appDescCleaning.textContent = 'Dries with minimal mineral spotting on glassware, windows, stainless steel faucets, and polished floors.';

            // Gardening
            elements.appStatusGardening.className = 'app-status-badge badge-acceptable';
            elements.appStatusGardening.textContent = 'Optimal';
            elements.appDescGardening.textContent = 'Ideal osmotic absorption across delicate houseplants, potted flora, seed beds, and vegetable gardens.';
        }
        else if (ppm <= 2000) {
            // Drinking & Cooking
            elements.appStatusDrinking.className = 'app-status-badge badge-permissible';
            elements.appStatusDrinking.textContent = 'Permissible';
            elements.appDescDrinking.textContent = 'Exceeds acceptable limit (500 ppm) but remains permissible in absence of an alternate source. Beverages may taste slightly brackish or mineral-heavy.';

            // Bathing
            elements.appStatusBathing.className = 'app-status-badge badge-permissible';
            elements.appStatusBathing.textContent = 'Usable';
            elements.appDescBathing.textContent = 'Usable for daily bathing. Slightly reduced lathering; sensitive skin may feel mildly dry or coated after washing.';

            // Laundry
            elements.appStatusLaundry.className = 'app-status-badge badge-permissible';
            elements.appStatusLaundry.textContent = 'Extra Detergent';
            elements.appDescLaundry.textContent = 'Dissolved mineral salts bind partially to surfactants, requiring 15–25% more detergent. White fabrics may stiffen gradually.';

            // Cleaning
            elements.appStatusCleaning.className = 'app-status-badge badge-permissible';
            elements.appStatusCleaning.textContent = 'Mild Spots';
            elements.appDescCleaning.textContent = 'Leaves faint water spots on glasses and mirror surfaces if left to air dry. Suitable for general floor mopping.';

            // Gardening
            elements.appStatusGardening.className = 'app-status-badge badge-permissible';
            elements.appStatusGardening.textContent = 'Hardy Plants Only';
            elements.appDescGardening.textContent = 'Acceptable for established lawns, trees, and hardy shrubs. Periodic flushing recommended to avoid potted soil salt buildup.';
        }
        else {
            // Drinking & Cooking
            elements.appStatusDrinking.className = 'app-status-badge badge-excess';
            elements.appStatusDrinking.textContent = 'Exceeds Limit';
            elements.appDescDrinking.textContent = 'Exceeds the BIS permissible limit (2000 mg/L). Do not consider suitable for drinking or cooking. Seek alternative verified drinking water.';

            // Bathing
            elements.appStatusBathing.className = 'app-status-badge badge-excess';
            elements.appStatusBathing.textContent = 'Saline / Stiff';
            elements.appDescBathing.textContent = 'Soap forms curd-like precipitate rather than lather. Can cause dry, itchy skin and brittle hair texture.';

            // Laundry
            elements.appStatusLaundry.className = 'app-status-badge badge-excess';
            elements.appStatusLaundry.textContent = 'Fabric Damage';
            elements.appDescLaundry.textContent = 'Severe soap scum precipitation damages fabrics, leaves gray residue, and accelerates wear on washing machine pumps.';

            // Cleaning
            elements.appStatusCleaning.className = 'app-status-badge badge-excess';
            elements.appStatusCleaning.textContent = 'Heavy Scaling';
            elements.appDescCleaning.textContent = 'Leaves conspicuous white chalky scale on tiles, porcelain sinks, and metal fixtures. Corrosive over time.';

            // Gardening
            elements.appStatusGardening.className = 'app-status-badge badge-excess';
            elements.appStatusGardening.textContent = 'High Salinity Risk';
            elements.appDescGardening.textContent = 'High osmotic potential restricts root water uptake, causing leaf tip scorch, root toxicity, and soil degradation.';
        }
    }

    // ==========================================================================
    // Simulation / Demo Mode Engine
    // ==========================================================================
    function seedDemoHistory() {
        const now = new Date();
        state.history.timestamps = [];
        state.history.tds = [];
        state.history.temp = [];
        state.history.rawVolts = [];
        state.history.records = [];

        for (let i = 18; i >= 0; i--) {
            const t = new Date(now.getTime() - i * state.pollIntervalMs);
            const timeLabel = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const driftTds = state.simulated.currentTds + Math.sin(i * 0.4) * 6.0 + (Math.random() - 0.5) * 3.0;
            const driftTemp = state.simulated.currentTemp + Math.cos(i * 0.3) * 0.4 + (Math.random() - 0.5) * 0.2;
            const rawV = (driftTds / 500.0) * 1.05;
            const cls = classifyTds(driftTds);

            state.history.timestamps.push(timeLabel);
            state.history.tds.push(parseFloat(driftTds.toFixed(1)));
            state.history.temp.push(parseFloat(driftTemp.toFixed(1)));
            state.history.rawVolts.push(parseFloat(rawV.toFixed(3)));

            state.history.records.unshift({
                timestamp: timeLabel,
                tds_ppm: driftTds,
                temp_c: driftTemp,
                tds_raw_v: rawV,
                classification: cls.classification,
                classificationColor: cls.color,
                statusClass: 'simulated',
                statusText: 'Simulated'
            });
        }

        if (state.chartInstance) {
            state.chartInstance.update();
        }
        renderReadingsTable();
    }

    function stepSimulatedData() {
        state.simulated.uptimeSeconds += Math.round(state.pollIntervalMs / 1000);

        // Smooth convergence toward selected preset
        const tdsDelta = (state.simulated.targetTds - state.simulated.currentTds) * 0.25;
        const tdsJitter = (Math.random() - 0.49) * 2.2;
        state.simulated.currentTds += tdsDelta + tdsJitter;

        const tempDelta = (state.simulated.targetTemp - state.simulated.currentTemp) * 0.25;
        const tempJitter = (Math.random() - 0.49) * 0.12;
        state.simulated.currentTemp += tempDelta + tempJitter;

        const rawVoltage = (state.simulated.currentTds / 480.0) * 1.05;
        const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const cls = classifyTds(state.simulated.currentTds);

        renderTelemetryUI({
            tds_ppm: state.simulated.currentTds,
            tds_raw_v: rawVoltage,
            tds_status: 'ok',
            temp_c: state.simulated.currentTemp,
            temp_status: 'ok',
            uptime_s: state.simulated.uptimeSeconds,
            wifi_rssi: -58,
            ip: '127.0.0.1 (Sandbox)',
            isDemo: true
        });

        const record = {
            timestamp: nowLabel,
            tds_ppm: state.simulated.currentTds,
            temp_c: state.simulated.currentTemp,
            tds_raw_v: rawVoltage,
            classification: cls.classification,
            classificationColor: cls.color,
            statusClass: 'simulated',
            statusText: 'Simulated'
        };

        updateChartData(nowLabel, parseFloat(state.simulated.currentTds.toFixed(1)), parseFloat(state.simulated.currentTemp.toFixed(1)), record);
    }

    // ==========================================================================
    // Live Hardware Polling Engine
    // ==========================================================================
    async function fetchLiveESP32Data() {
        const startTime = performance.now();
        // When loaded on HTTPS, always use same-origin /api/data to avoid Mixed-Content blocks
        const endpoint = isHttps ? `${currentOrigin || ''}/api/data` : `${state.esp32Url.replace(/\/+$/, '')}/api/data`;

        let data;
        let latency;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(endpoint, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);
            latency = Math.round(performance.now() - startTime);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            data = await response.json();
        } catch (fetchErr) {
            handleLiveConnectionError(fetchErr);
            return;
        }

        try {
            data.isDemo = false;
            data.latencyMs = latency;
            consecutiveErrors = 0;

            const isOnline = data.esp32_connected !== false;
            if (isOnline) {
                elements.deviceStatusBadge.className = 'device-status-badge';
                const devIpStr = (data.device_ip && data.device_ip !== 'cloud-push') ? data.device_ip : (data.ip || 'LIVE ESP32');
                elements.deviceStatusText.textContent = `LIVE: ${devIpStr}`;
                elements.diagLatency.textContent = `${latency} ms`;
                elements.statPingBadge.textContent = `${latency} ms`;
                elements.valConnectivityStatus.textContent = 'Online';
                elements.badgeConnectivity.className = 'status-badge ok';
                elements.badgeConnectivity.textContent = 'Live';
            } else {
                elements.deviceStatusBadge.className = 'device-status-badge warn-state';
                elements.deviceStatusText.textContent = 'WAITING FOR SENSOR DATA';
                elements.valConnectivityStatus.textContent = 'Waiting';
                elements.badgeConnectivity.className = 'status-badge warn';
                elements.badgeConnectivity.textContent = 'Waiting';
                elements.statPingBadge.textContent = `${latency} ms`;
                elements.diagLatency.textContent = `${latency} ms`;
            }

            renderTelemetryUI(data);

            const rawV = (typeof data.tds_raw_v === 'number') ? data.tds_raw_v : ((typeof data.raw_v === 'number') ? data.raw_v : 0);
            const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const cls = classifyTds(data.tds_ppm, rawV);
            const ec = typeof data.ec_us_cm === 'number' ? Math.round(data.ec_us_cm) : Math.round((data.tds_ppm || 0) * 2);

            const record = {
                timestamp: nowLabel,
                tds_ppm: typeof data.tds_ppm === 'number' ? data.tds_ppm : 0,
                ec_us_cm: ec,
                temp_c: typeof data.temp_c === 'number' ? data.temp_c : 0,
                tds_raw_v: rawV,
                raw_v: rawV,
                classification: cls.classification,
                classificationColor: cls.color,
                statusClass: (data.tds_status === 'ok' && data.temp_status === 'ok') ? 'ok' : 'warn',
                statusText: (data.tds_status === 'ok' && data.temp_status === 'ok') ? 'Normal' : 'Sensor Alert'
            };

            if (data.tds_status === 'ok' && data.temp_status === 'ok') {
                updateChartData(nowLabel, record.tds_ppm, record.temp_c, record);
            }
        } catch (uiErr) {
            console.error('Error rendering live telemetry data:', uiErr);
        }
    }

    let consecutiveErrors = 0;
    const CANDIDATE_URLS = [
        ...(window.location.origin && window.location.origin.startsWith('http') ? [window.location.origin] : []),
        'http://10.189.27.140',
        'http://192.168.4.1'
    ];

    async function handleLiveConnectionError(err) {
        consecutiveErrors++;
        // Avoid flickering on transient single packet drop
        if (consecutiveErrors < 2) return;

        elements.deviceStatusBadge.className = 'device-status-badge error-state';
        elements.deviceStatusText.textContent = 'OFFLINE / RECONNECTING...';
        elements.valConnectivityStatus.textContent = 'Offline';
        elements.badgeConnectivity.className = 'status-badge error';
        elements.badgeConnectivity.textContent = 'Reconnecting';
        elements.statPingBadge.textContent = 'Timeout';
        elements.diagLatency.textContent = 'Timeout';
        if (elements.valDeviceIp) {
            elements.valDeviceIp.textContent = (isHttps ? currentOrigin : state.esp32Url).replace(/^https?:\/\//, '');
        }

        if (elements.verdictMasterCard && state.history.records.length === 0) {
            elements.verdictMasterCard.className = 'verdict-master-card state-warning';
            elements.verdictOverallIcon.textContent = '⏳';
            elements.verdictOverallTitle.textContent = 'Awaiting Hardware Telemetry...';
            elements.verdictOverallBadge.className = 'verdict-status-pill pill-warning';
            elements.verdictOverallBadge.textContent = 'Connecting';
            elements.verdictOverallDesc.textContent = `Reconnecting to ESP32 at ${state.esp32Url}. As soon as live telemetry is received, the water usability assessment will update instantly.`;
        }

        // Auto-probe alternative endpoints if connection fails repeatedly
        if (consecutiveErrors >= 3) {
            for (const cand of CANDIDATE_URLS) {
                if (cand !== state.esp32Url) {
                    try {
                        const probeCtrl = new AbortController();
                        const pTimeout = setTimeout(() => probeCtrl.abort(), 1500);
                        const probeRes = await fetch(`${cand}/api/data`, { signal: probeCtrl.signal });
                        clearTimeout(pTimeout);
                        if (probeRes.ok) {
                            state.esp32Url = cand;
                            localStorage.setItem('waterIntel_esp32_url', cand);
                            consecutiveErrors = 0;
                            showToast(`Auto-discovered ESP32 at ${cand}!`, 'success');
                            break;
                        }
                    } catch (e) {}
                }
            }
        }

        if (window.location.protocol === 'https:' && state.esp32Url.startsWith('http://')) {
            elements.deviceStatusText.textContent = 'MIXED CONTENT BLOCKED';
            showToast('HTTPS page cannot directly fetch unencrypted local HTTP. Use localhost.', 'warn');
        }
    }

    // ==========================================================================
    // UI Rendering
    // ==========================================================================
    function renderTelemetryUI(data) {
        // Platform tags
        if (data.isDemo) {
            elements.heroPlatformTag.textContent = 'Virtual Sandbox';
            elements.valConnectivityStatus.textContent = 'Active';
            elements.badgeConnectivity.className = 'status-badge simulated';
            elements.badgeConnectivity.textContent = 'Simulated';
        } else {
            elements.heroPlatformTag.textContent = 'ESP-WROOM-32';
            elements.valConnectivityStatus.textContent = 'Online';
            elements.badgeConnectivity.className = 'status-badge ok';
            elements.badgeConnectivity.textContent = 'Live';
        }

        // TDS Card (Animated number transitions)
        if (data.tds_status === 'ok' && typeof data.tds_ppm === 'number') {
            const ppm = data.tds_ppm;
            animateNumber(elements.valTds, state.displayedValues.tds, ppm, 500, 0);
            state.displayedValues.tds = ppm;

            elements.badgeTdsStatus.className = 'status-badge ok';
            elements.badgeTdsStatus.textContent = data.isDemo ? 'Simulated' : 'Normal';

            const classification = classifyTds(ppm, data.tds_raw_v);
            elements.valTdsClassification.textContent = classification.classification;
            elements.valTdsClassification.style.color = classification.color;

            elements.diagTds.textContent = 'Online';
            elements.diagTds.style.color = 'var(--emerald-400)';
        } else {
            elements.valTds.textContent = 'ERR';
            elements.badgeTdsStatus.className = 'status-badge error';
            elements.badgeTdsStatus.textContent = 'Fault';
            elements.valTdsClassification.textContent = 'Invalid ADC Voltage';
            elements.valTdsClassification.style.color = 'var(--rose-400)';
            elements.diagTds.textContent = 'Sensor Error';
            elements.diagTds.style.color = 'var(--rose-400)';
        }

        const displayRawV = (typeof data.tds_raw_v === 'number') ? data.tds_raw_v : ((typeof data.raw_v === 'number') ? data.raw_v : null);
        const displayRawAdc = (typeof data.tds_raw_adc === 'number') ? data.tds_raw_adc : ((typeof data.raw_adc === 'number') ? data.raw_adc : null);
        if (displayRawV !== null) {
            const rawAdcStr = (displayRawAdc !== null) ? ` (ADC: ${displayRawAdc})` : '';
            elements.valTdsVoltage.textContent = `${displayRawV.toFixed(3)} V${rawAdcStr}`;
        }
        if (elements.valTdsEc) {
            const ec = typeof data.ec_us_cm === 'number' ? data.ec_us_cm : Math.round((data.tds_ppm || 0) * 2);
            elements.valTdsEc.textContent = `${ec} µS/cm`;
        }

        // Temperature Card (Animated number transitions)
        if (data.temp_status === 'ok' && typeof data.temp_c === 'number') {
            const temp = data.temp_c;
            animateNumber(elements.valTemp, state.displayedValues.temp, temp, 500, 1);
            state.displayedValues.temp = temp;

            elements.valTempF.textContent = `${((temp * 9/5) + 32).toFixed(1)} °F`;
            elements.badgeTempStatus.className = 'status-badge ok';
            elements.badgeTempStatus.textContent = data.isDemo ? 'Simulated' : 'Normal';

            elements.diagDs18b20.textContent = 'Online';
            elements.diagDs18b20.style.color = 'var(--emerald-400)';
        } else if (data.temp_status === 'disconnected') {
            elements.valTemp.textContent = 'ERR';
            elements.valTempF.textContent = 'Disconnected (-127°C)';
            elements.badgeTempStatus.className = 'status-badge error';
            elements.badgeTempStatus.textContent = 'Disconnected';
            elements.diagDs18b20.textContent = 'Disconnected';
            elements.diagDs18b20.style.color = 'var(--rose-400)';
        } else {
            elements.valTemp.textContent = 'ERR';
            elements.badgeTempStatus.className = 'status-badge warn';
            elements.badgeTempStatus.textContent = 'Fault';
            elements.diagDs18b20.textContent = 'Fault';
            elements.diagDs18b20.style.color = 'var(--amber-400)';
        }

        // Connectivity details
        if (data.device_ip === 'cloud-push' || data.device_ip === 'ESP32 (Live Cloud Push)') {
            elements.valDeviceIp.textContent = 'ESP32 Cloud Stream';
        } else {
            elements.valDeviceIp.textContent = data.device_ip || data.ip || 'ESP32 Live Stream';
        }
        if (typeof data.wifi_rssi === 'number') {
            elements.valWifiRssi.textContent = `${data.wifi_rssi} dBm`;
        } else {
            elements.valWifiRssi.textContent = 'Active Hotspot';
        }
        if (typeof data.uptime_s === 'number') {
            elements.valUptime.textContent = formatUptime(data.uptime_s);
        } else {
            elements.valUptime.textContent = 'Live Stream';
        }

        // Update probe status chip in analysis hub
        state.currentLiveTelemetry = data;
        updateHubProbeStatus(data);

        // Compute Actionable Usability Verdict (Drinking, Boiling, Household)
        evaluateWaterUsability(data);

        // Compute AQUASENSE BIS IS 10500 Results & Reference Comparison
        updateBisAssessmentSection(data);
    }

    // ==========================================================================
    // Mode Switcher Controller
    // ==========================================================================
    function setMode(newMode) {
        state.mode = newMode;
        localStorage.setItem('waterIntel_mode', newMode);

        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }

        if (newMode === 'demo') {
            elements.btnModeDemo.className = 'control-btn active-demo';
            elements.btnModeLive.className = 'control-btn';
            elements.demoBannerBox.style.display = 'flex';
            elements.deviceStatusBadge.className = 'device-status-badge demo-active';
            elements.deviceStatusText.textContent = 'DEMO MODE ACTIVE';

            showToast('Demo Mode active: displaying simulated environmental telemetry.', 'info');
            seedDemoHistory();
            stepSimulatedData();
            state.pollTimer = setInterval(stepSimulatedData, state.pollIntervalMs);
        } else {
            elements.btnModeDemo.className = 'control-btn';
            elements.btnModeLive.className = 'control-btn active-live';
            elements.demoBannerBox.style.display = 'none';
            elements.deviceStatusBadge.className = 'device-status-badge';
            elements.deviceStatusText.textContent = 'CONNECTING TO ESP32...';

            showToast(`Connecting to ESP32 at ${state.esp32Url}...`, 'info');

            state.history.timestamps = [];
            state.history.tds = [];
            state.history.temp = [];
            state.history.records = [];
            state.displayedValues.tds = 0;
            state.displayedValues.temp = 0;
            elements.valTds.textContent = '--';
            elements.valTemp.textContent = '--';
            elements.valTempF.textContent = '-- °F';
            elements.valTdsVoltage.textContent = '-- V';
            elements.valTdsClassification.textContent = 'Awaiting hardware telemetry...';
            elements.valTdsClassification.style.color = 'var(--text-muted)';
            elements.badgeTdsStatus.className = 'status-badge warn';
            elements.badgeTdsStatus.textContent = 'Connecting';
            elements.badgeTempStatus.className = 'status-badge warn';
            elements.badgeTempStatus.textContent = 'Connecting';
            elements.valConnectivityStatus.textContent = 'Searching';
            elements.badgeConnectivity.className = 'status-badge warn';
            elements.badgeConnectivity.textContent = 'Connecting';
            if (elements.valDeviceIp) {
                elements.valDeviceIp.textContent = state.esp32Url.replace(/^https?:\/\//, '');
            }
            renderReadingsTable();
            if (state.chartInstance) state.chartInstance.update();

            fetchLiveESP32Data();
            state.pollTimer = setInterval(fetchLiveESP32Data, state.pollIntervalMs);
        }
    }

    // ==========================================================================
    // Simulation Sandbox Preset Handler
    // ==========================================================================
    function setupSimulationPresets() {
        const presetChips = document.querySelectorAll('.preset-chip');
        presetChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const targetTds = parseFloat(chip.getAttribute('data-tds'));
                const targetTemp = parseFloat(chip.getAttribute('data-temp'));
                state.simulated.targetTds = targetTds;
                state.simulated.targetTemp = targetTemp;

                showToast(`Simulation preset: ${chip.textContent.trim()} loaded`, 'success');
            });
        });
    }

    // ==========================================================================
    // Chart Filter & Stream Pause Controls
    // ==========================================================================
    function setChartFilter(filter) {
        state.chartFilter = filter;
        elements.btnFilterAll.classList.toggle('active', filter === 'all');
        elements.btnFilterTds.classList.toggle('active', filter === 'tds');
        elements.btnFilterTemp.classList.toggle('active', filter === 'temp');

        if (!state.chartInstance) return;

        if (filter === 'all') {
            state.chartInstance.setDatasetVisibility(0, true);
            state.chartInstance.setDatasetVisibility(1, true);
            state.chartInstance.options.scales.yTds.display = true;
            state.chartInstance.options.scales.yTemp.display = true;
        } else if (filter === 'tds') {
            state.chartInstance.setDatasetVisibility(0, true);
            state.chartInstance.setDatasetVisibility(1, false);
            state.chartInstance.options.scales.yTds.display = true;
            state.chartInstance.options.scales.yTemp.display = false;
        } else if (filter === 'temp') {
            state.chartInstance.setDatasetVisibility(0, false);
            state.chartInstance.setDatasetVisibility(1, true);
            state.chartInstance.options.scales.yTds.display = false;
            state.chartInstance.options.scales.yTemp.display = true;
        }

        state.chartInstance.update();
    }

    function toggleStreamPause() {
        state.isStreamPaused = !state.isStreamPaused;
        elements.textToggleStream.textContent = state.isStreamPaused ? 'Resume' : 'Pause';
        elements.btnToggleStream.classList.toggle('active', state.isStreamPaused);

        if (state.isStreamPaused) {
            showToast('Telemetry stream paused.', 'info');
        } else {
            showToast('Telemetry stream resumed.', 'success');
        }
    }

    async function exportToCsv() {
        // In production with backend available, try downloading complete database history
        const origin = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : '';
        if (origin) {
            try {
                const apiRes = await fetch(`${origin}/api/export`);
                if (apiRes.ok) {
                    const blob = await apiRes.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `aquasense_database_telemetry_${Date.now()}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    showToast('Full telemetry archive downloaded from database.', 'success');
                    return;
                }
            } catch (e) {
                // Fallback to client session export
            }
        }

        if (!state.history.records.length && !state.history.timestamps.length) {
            showToast('No telemetry points available to export.', 'warn');
            return;
        }

        let csv = 'Timestamp,TDS_ppm,Conductivity_uS_cm,Temperature_C,Temperature_F,ADC_Voltage_V,Classification,Status\n';
        if (state.history.records.length > 0) {
            for (let i = 0; i < state.history.records.length; i++) {
                const r = state.history.records[i];
                const tempC = typeof r.temp_c === 'number' ? r.temp_c : 0;
                const tempF = ((tempC * 9/5) + 32).toFixed(1);
                const ec = typeof r.ec_us_cm === 'number' ? Math.round(r.ec_us_cm) : Math.round((r.tds_ppm || 0) * 2);
                const rawV = (typeof r.tds_raw_v === 'number') ? r.tds_raw_v : ((typeof r.raw_v === 'number') ? r.raw_v : 0);
                csv += `"${r.timestamp}",${Math.round(r.tds_ppm || 0)},${ec},${tempC.toFixed(1)},${tempF},${rawV.toFixed(3)},"${r.classification || ''}","${r.statusText || ''}"\n`;
            }
        } else {
            for (let i = 0; i < state.history.timestamps.length; i++) {
                const time = state.history.timestamps[i];
                const tds = state.history.tds[i] !== undefined ? Math.round(state.history.tds[i]) : '';
                const ec = tds !== '' ? Math.round(tds * 2) : '';
                const temp = state.history.temp[i] !== undefined ? state.history.temp[i].toFixed(1) : '';
                const tempF = temp !== '' ? ((parseFloat(temp) * 9/5) + 32).toFixed(1) : '';
                csv += `"${time}",${tds},${ec},${temp},${tempF},"","",""\n`;
            }
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `water_quality_telemetry_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('Telemetry CSV export downloaded successfully.', 'success');
    }

    // ==========================================================================
    // Fullscreen API Handler
    // ==========================================================================
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }

    // ==========================================================================
    // Settings Modal Controller
    // ==========================================================================
    function openSettingsModal() {
        elements.inputEsp32Url.value = state.esp32Url;
        elements.selectPollRate.value = state.pollIntervalMs.toString();
        elements.testFeedbackText.textContent = '';
        elements.settingsModal.classList.add('open');
    }

    function closeSettingsModal() {
        elements.settingsModal.classList.remove('open');
    }

    async function testESP32Connection() {
        const testUrl = elements.inputEsp32Url.value.trim().replace(/\/+$/, '');
        if (!testUrl) {
            elements.testFeedbackText.textContent = 'Please enter a valid URL.';
            elements.testFeedbackText.style.color = 'var(--rose-400)';
            return;
        }

        elements.testFeedbackText.textContent = 'Pinging ESP32 /api/data...';
        elements.testFeedbackText.style.color = 'var(--text-secondary)';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const res = await fetch(`${testUrl}/api/data`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const sample = await res.json();
                elements.testFeedbackText.textContent = `Ping verified! Response from ${sample.ip || 'ESP32'}`;
                elements.testFeedbackText.style.color = 'var(--emerald-400)';
            } else {
                elements.testFeedbackText.textContent = `Received HTTP status ${res.status}`;
                elements.testFeedbackText.style.color = 'var(--amber-400)';
            }
        } catch (err) {
            if (window.location.protocol === 'https:' && testUrl.startsWith('http://')) {
                elements.testFeedbackText.innerHTML = `
                    <span style="color: var(--rose-400)">Browser Mixed Content Block:</span><br>
                    HTTPS cannot directly query an unencrypted local IP.
                    Test locally via <code>http://localhost:8080</code>.
                `;
            } else {
                elements.testFeedbackText.textContent = `Connection failed: ${err.message || 'Device unreachable'}`;
                elements.testFeedbackText.style.color = 'var(--rose-400)';
            }
        }
    }

    function saveSettings() {
        const newUrl = elements.inputEsp32Url.value.trim().replace(/\/+$/, '');
        const newPoll = parseInt(elements.selectPollRate.value, 10);

        if (newUrl) {
            state.esp32Url = newUrl;
            localStorage.setItem('waterIntel_esp32_url', newUrl);
        }

        if (newPoll >= 1000) {
            state.pollIntervalMs = newPoll;
            localStorage.setItem('waterIntel_poll_rate', newPoll);
        }

        closeSettingsModal();
        showToast('Configuration saved successfully.', 'success');
        setMode(state.mode);
    }

    // ==========================================================================
    // Event Listeners Initialization
    // ==========================================================================
    function attachEventListeners() {
        elements.btnModeDemo.addEventListener('click', () => setMode('demo'));
        elements.btnModeLive.addEventListener('click', () => setMode('live'));
        elements.linkSwitchLive.addEventListener('click', () => setMode('live'));
        elements.btnToggleFullscreen.addEventListener('click', toggleFullscreen);

        // Chart controls
        elements.btnFilterAll.addEventListener('click', () => setChartFilter('all'));
        elements.btnFilterTds.addEventListener('click', () => setChartFilter('tds'));
        elements.btnFilterTemp.addEventListener('click', () => setChartFilter('temp'));
        elements.btnToggleStream.addEventListener('click', toggleStreamPause);
        elements.btnExportCsv.addEventListener('click', exportToCsv);

        // Modal triggers
        elements.btnOpenSettings.addEventListener('click', openSettingsModal);
        elements.btnCloseModal.addEventListener('click', closeSettingsModal);
        elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
        elements.btnSaveSettings.addEventListener('click', saveSettings);
        elements.btnTestConnection.addEventListener('click', testESP32Connection);

        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) closeSettingsModal();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.settingsModal.classList.contains('open')) {
                closeSettingsModal();
            }
        });

        setupSimulationPresets();

        // Water Analysis Hub Listeners
        if (elements.btnStartAnalysis) {
            elements.btnStartAnalysis.addEventListener('click', startWaterAnalysis);
        }
        if (elements.btnReanalyze) {
            elements.btnReanalyze.addEventListener('click', resetWaterAnalysis);
        }
        if (elements.btnPrintReport) {
            elements.btnPrintReport.addEventListener('click', () => window.print());
        }
    }

    async function loadInitialHistory() {
        const origin = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : '';
        if (!origin) return;
        try {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), 2000);
            const res = await fetch(`${origin}/api/history?limit=25`, { signal: ctrl.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.records && data.records.length > 0) {
                const reversed = data.records.slice().reverse();
                for (const r of reversed) {
                    const timeLabel = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || r.timestamp;
                    const cls = classifyTds(r.tds_ppm, r.raw_v);
                    const ec = Math.round(r.tds_ppm * 2);
                    const record = {
                        timestamp: timeLabel,
                        tds_ppm: r.tds_ppm,
                        ec_us_cm: ec,
                        temp_c: r.temp_c,
                        tds_raw_v: r.raw_v || 0,
                        classification: cls.classification,
                        classificationColor: cls.color,
                        statusClass: (r.tds_status === 'ok' && r.temp_status === 'ok') ? 'ok' : 'warn',
                        statusText: (r.tds_status === 'ok' && r.temp_status === 'ok') ? 'Normal' : 'Sensor Alert'
                    };
                    updateChartData(timeLabel, r.tds_ppm, r.temp_c, record);
                }
                const latest = data.records[0];
                renderTelemetryUI(latest);
            }
        } catch (e) {
            // Silently fall through to live poll
        }
    }

    // ==========================================================================
    // Bootstrap
    // ==========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        initAmbientCanvas();
        initChart();
        attachEventListeners();
        loadInitialHistory();
        setMode(state.mode);
    });

})();
