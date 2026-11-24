/**
 * SEK GROWING — Agricultural Field & Carbon Intelligence Platform
 * Clean, Professional, Real Satellite Map & Live Weather (IPCC Standards)
 */

let map;
let drawnItems;
let currentLayer = null;
let currentAreaStats = null;
let currentWeatherData = null;
let isAwdActive = true;
let samplePlotIndex = 0;
let currentValidation = null;

// ขอบเขตพิกัดประเทศไทย (Thailand Boundary Bounds)
const THAILAND_BOUNDS = [
  [5.5, 97.2],   // ใต้สุด-ตะวันตก
  [20.6, 105.8]  // เหนือสุด-ตะวันออก
];

// แปลงตัวอย่างสำหรับทดสอบระบบ
const SAMPLE_PLOTS = [
  {
    name: "แปลงนาข้าวสาธิต (จ.นครสวรรค์ - ลุ่มน้ำเจ้าพระยา)",
    lat: 15.7285,
    lng: 100.1620,
    polygonCoords: [
      [15.7298, 100.1605],
      [15.7312, 100.1638],
      [15.7275, 100.1652],
      [15.7262, 100.1618]
    ]
  },
  {
    name: "แปลงนาข้าวสาธิต (จ.ร้อยเอ็ด - ทุ่งกุลาร้องไห้)",
    lat: 15.5840,
    lng: 103.6820,
    polygonCoords: [
      [15.5860, 103.6800],
      [15.5875, 103.6840],
      [15.5830, 103.6850],
      [15.5815, 103.6810]
    ]
  },
  {
    name: "จุดทดสอบ: เขตบ้านเรือน/ชุมชนหนาแน่น (กทม.) [ทดสอบระบบเตือน]",
    lat: 13.7563,
    lng: 100.5018,
    polygonCoords: [
      [13.7570, 100.5005],
      [13.7575, 100.5030],
      [13.7550, 100.5032],
      [13.7548, 100.5008]
    ]
  },
  {
    name: "จุดทดสอบ: แม่น้ำ/แหล่งน้ำเปิด [ทดสอบระบบเตือน]",
    lat: 13.7469,
    lng: 100.4930,
    polygonCoords: [
      [13.7480, 100.4915],
      [13.7485, 100.4945],
      [13.7455, 100.4948],
      [13.7450, 100.4920]
    ]
  }
];

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupUIEventListeners();
  loadSamplePlot(0);
});

// 1. แผนที่ภาพถ่ายดาวเทียมความคมชัดสูง สโคปประเทศไทย
function initMap() {
  const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Satellite'
  });

  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '© Esri Satellite'
  });

  const bounds = L.latLngBounds(THAILAND_BOUNDS[0], THAILAND_BOUNDS[1]);

  map = L.map('map', {
    center: [14.0, 100.8],
    zoom: 7,
    minZoom: 6,
    maxZoom: 19,
    maxBounds: bounds,
    maxBoundsViscosity: 0.9,
    layers: [googleSat]
  });

  L.control.layers({
    "ภาพดาวเทียม Google": googleSat,
    "ภาพดาวเทียม Esri": esriSat
  }, null, { position: 'topright' }).addTo(map);

  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  setupDrawingTools();
}

// 2. เครื่องมือวาดแปลงนา
function setupDrawingTools() {
  const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.35,
          weight: 3
        }
      },
      circle: {
        shapeOptions: {
          color: '#0284c7',
          fillColor: '#0284c7',
          fillOpacity: 0.35,
          weight: 3
        }
      },
      rectangle: {
        shapeOptions: {
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.35,
          weight: 3
        }
      },
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: true
    }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (event) => {
    drawnItems.clearLayers();
    const layer = event.layer;
    drawnItems.addLayer(layer);
    currentLayer = layer;
    analyzePlot(layer);
  });

  map.on(L.Draw.Event.EDITED, () => {
    if (currentLayer) analyzePlot(currentLayer);
  });

  map.on(L.Draw.Event.DELETED, () => {
    resetToPromptState();
  });
}

// 3. โหลดแปลงตัวอย่าง
function loadSamplePlot(index = 0) {
  const plot = SAMPLE_PLOTS[index % SAMPLE_PLOTS.length];
  drawnItems.clearLayers();

  const samplePoly = L.polygon(plot.polygonCoords, {
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.38,
    weight: 3
  });
  drawnItems.addLayer(samplePoly);
  currentLayer = samplePoly;
  map.fitBounds(samplePoly.getBounds(), { padding: [50, 50], maxZoom: 16 });
  analyzePlot(samplePoly, plot.name);
}

// 4. วิเคราะห์แปลงนา (ตรวจสอบพื้นที่จริง + สภาพอากาศจริง + คำนวณคาร์บอน IPCC)
async function analyzePlot(layer, customPlotName = null) {
  let sqMeters = 0;
  let centerLat = 0;
  let centerLng = 0;

  if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
    const latlngs = layer.getLatLngs()[0];
    sqMeters = SekModels.computePolygonArea(latlngs);
    const bounds = layer.getBounds();
    const center = bounds.getCenter();
    centerLat = center.lat;
    centerLng = center.lng;
  } else if (layer instanceof L.Circle) {
    const radius = layer.getRadius();
    sqMeters = Math.PI * radius * radius;
    const center = layer.getLatLng();
    centerLat = center.lat;
    centerLng = center.lng;
  }

  currentAreaStats = SekModels.calculateThaiArea(sqMeters);

  // ซ่อนแถบคำแนะนำ
  const hintBox = document.getElementById("drawHintBox");
  if (hintBox) hintBox.style.display = "none";

  // อัปเดตข้อมูลขนาดแปลง
  document.getElementById("plotTitle").innerText = customPlotName || `แปลงนาพิกัด [${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}]`;
  document.getElementById("plotAreaText").innerText = currentAreaStats.formattedText;
  document.getElementById("plotSqMetersText").innerText = `(${currentAreaStats.sqMeters.toLocaleString()} ตร.ม.)`;

  renderValidationLoading();

  // 4.1 ตรวจสอบความถูกต้องของพื้นที่ (Land Validation)
  currentValidation = await SekModels.validateLandUse(centerLat, centerLng, sqMeters);
  renderValidationBanner(currentValidation);

  // 4.2 กรณีไม่ใช่แปลงนา (บ้านเรือนหรือแหล่งน้ำ)
  if (!currentValidation.isValidRiceField) {
    if (layer && typeof layer.setStyle === 'function') {
      const alertColor = currentValidation.landType === 'water' ? '#0284c7' : '#ef4444';
      layer.setStyle({ color: alertColor, fillColor: alertColor, fillOpacity: 0.45, weight: 3 });
    }
    renderInvalidPlotState(currentValidation);
    return;
  }

  // 4.3 กรณีผ่านการตรวจสอบ (แปลงนาถูกต้อง)
  if (layer && typeof layer.setStyle === 'function') {
    layer.setStyle({ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.35, weight: 3 });
  }

  // 4.4 ดึงข้อมูลสภาพอากาศและพยากรณ์อากาศ 7 วันจริงของพิกัดนี้
  currentWeatherData = await SekModels.fetchWeatherForecast(centerLat, centerLng);

  // 4.5 คำนวณคาร์บอนตามสมการมาตรฐาน IPCC Tier-2 และผลประโยชน์ทางการเงิน
  const carbonStats = SekModels.calculateCarbonEmissions(currentAreaStats.raiDecimal, isAwdActive, currentWeatherData);
  const financialStats = SekModels.calculateFinancialBenefits(currentAreaStats.raiDecimal, isAwdActive);
  const climateAlerts = SekModels.evaluateRisks(currentWeatherData);

  // 4.6 อัปเดต UI
  updateSummaryKPIs(carbonStats, financialStats);
  renderCarbonTab(carbonStats);
  renderWealthTab(financialStats, carbonStats);
  renderClimateTab(climateAlerts);
  renderWeatherForecastStrip(currentWeatherData);
}

// 5. แถบแสดงผลการตรวจสอบพื้นที่
function renderValidationLoading() {
  const container = document.getElementById("validationBanner");
  if (!container) return;
  container.className = "validation-banner loading";
  container.innerHTML = `
    <div class="val-icon spin">🛰️</div>
    <div class="val-info">
      <h4>กำลังตรวจสอบโครงสร้างพื้นที่ด้วยดาวเทียม...</h4>
      <p>คัดกรองสิ่งปลูกสร้าง แหล่งน้ำ และยืนยันความถูกต้องของแปลงเกษตร</p>
    </div>
  `;
}

function renderValidationBanner(val) {
  const container = document.getElementById("validationBanner");
  if (!container) return;

  container.className = `validation-banner ${val.severity}`;
  const icon = val.severity === "success" ? "✅" : (val.landType === "water" ? "🌊" : "⚠️");

  container.innerHTML = `
    <div class="val-icon">${icon}</div>
    <div class="val-info">
      <h4>${val.title}</h4>
      <p>${val.message}</p>
      <div class="val-tag">${val.details}</div>
    </div>
  `;
}

function renderInvalidPlotState(val) {
  document.getElementById("kpiCarbonVal").innerText = "ระงับการคำนวณ";
  document.getElementById("kpiCarbonSub").innerText = "ไม่ใช่แปลงนาข้าว";
  document.getElementById("kpiBenefitVal").innerText = "฿0";
  document.getElementById("kpiBenefitSub").innerText = val.title;
  document.getElementById("kpiStatusVal").innerText = val.title;
  document.getElementById("kpiStatusSub").innerText = "กรุณาวงเลือกเฉพาะพื้นที่ทำนา";

  document.getElementById("carbonBreakdownBox").innerHTML = `
    <div class="alert-box-danger">
      <h4 style="color: #ef4444; margin-bottom: 6px;">🚫 ระบบระงับการประเมินคาร์บอน</h4>
      <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5;">
        ${val.message}<br>
        <strong>คำแนะนำ:</strong> กรุณาวงเลือกเฉพาะพื้นที่คันนาหรือแปลงเพาะปลูกข้าวที่แท้จริง
      </p>
    </div>
  `;
}

// 6. อัปเดตตัวเลข Quick KPIs 4 ช่อง
function updateSummaryKPIs(carbon, finance) {
  document.getElementById("kpiStatusVal").innerText = isAwdActive ? "เปียกสลับแห้ง (AWD) 🟢" : "ขังน้ำต่อเนื่อง 🔴";
  document.getElementById("kpiStatusSub").innerText = isAwdActive ? "ลดมีเทน 48% ดินได้รับออกซิเจน" : "ดินขาดออกซิเจน เกิดก๊าซมีเทนสูง";

  document.getElementById("kpiReducedVal").innerText = isAwdActive ? `-${carbon.reductionPercent}%` : "0%";
  document.getElementById("kpiReducedSub").innerText = isAwdActive ? `ลดได้ ${carbon.carbonReducedTon} ตัน CO₂-eq` : "ปล่อยคาร์บอนเต็มพิกัด";

  document.getElementById("kpiCarbonVal").innerText = `${carbon.co2EqPerRai} kg`;
  document.getElementById("kpiCarbonSub").innerText = `CO₂-eq / ไร่ / ฤดูกาล`;

  document.getElementById("kpiBenefitVal").innerText = `฿${finance.totalBenefit.toLocaleString()}`;
  document.getElementById("kpiBenefitSub").innerText = `ต่อรอบปลูก (${currentAreaStats.raiDecimal} ไร่)`;
}

// 7. แท็บ 1: การจัดการน้ำและคาร์บอน (IPCC Tier-2)
function renderCarbonTab(carbon) {
  const container = document.getElementById("carbonBreakdownBox");
  container.innerHTML = `
    <div class="carbon-hero-card ${isAwdActive ? 'green' : 'amber'}">
      <div class="carbon-hero-top">
        <div>
          <span class="carbon-hero-label">การปล่อยก๊าซเรือนกระจกสะสม (IPCC Tier-2)</span>
          <div class="carbon-hero-val">${carbon.co2EqTonTotal} <span style="font-size: 1.1rem; font-weight: 500;">ตัน CO₂-eq</span></div>
        </div>
        <div class="carbon-reduction-badge ${isAwdActive ? 'active' : ''}">
          ${isAwdActive ? '🌱 ลดได้ 48%' : '⚠️ ปล่อยเต็มเกณฑ์'}
        </div>
      </div>
      <div class="carbon-hero-meter">
        <div class="carbon-meter-fill" style="width: ${isAwdActive ? '52%' : '100%'};"></div>
      </div>
      <div class="carbon-hero-sub">
        <span>มีเทนที่ปล่อย: ${carbon.methaneEmissionKg} kg CH₄</span>
        <span>กรณีขังน้ำปกติ: ${carbon.co2BaselineTon} ตัน CO₂-eq</span>
      </div>
    </div>

    <!-- ตารางการจัดการน้ำแนะนำ (AWD Protocol) -->
    <div class="luxury-box" style="margin-top: 14px;">
      <div class="box-header">
        <span>💧 ตารางการจัดการน้ำแนะนำ (AWD Protocol)</span>
        <span class="status-pill green">มาตรฐานกรมการข้าว</span>
      </div>
      <div class="awd-schedule-list">
        <div class="schedule-item">
          <div class="schedule-badge">1 - 15 วัน</div>
          <div class="schedule-text">
            <strong>ระยะปักดำ / หว่าน:</strong> ขังน้ำตื้น 3-5 ซม. เพื่อคุมวัชพืชและให้ต้นกล้าตั้งตัว
          </div>
        </div>
        <div class="schedule-item highlight">
          <div class="schedule-badge active">16 - 35 วัน</div>
          <div class="schedule-text">
            <strong>ระยะแตกกอ (เริ่มเปียกสลับแห้ง):</strong> ปล่อยน้ำแห้งจนผิวดินแตกระแหง 5-7 วัน รากจะหยั่งลึก ลดมีเทนทันที!
          </div>
        </div>
        <div class="schedule-item">
          <div class="schedule-badge">36 - 65 วัน</div>
          <div class="schedule-text">
            <strong>ระยะตั้งท้อง:</strong> หล่อน้ำ 5-7 ซม. ห้ามขาดน้ำเด็ดขาดเพราะข้าวต้องการสร้างรวง
          </div>
        </div>
        <div class="schedule-item">
          <div class="schedule-badge">66 วัน - เกี่ยว</div>
          <div class="schedule-text">
            <strong>ระยะน้ำนมถึงสุกแก่:</strong> ปล่อยน้ำแห้งสนิทก่อนเกี่ยว 10-15 วัน เพื่อให้ดินแน่นและเก็บเกี่ยวง่าย
          </div>
        </div>
      </div>
    </div>
  `;
}

// 8. แท็บ 2: เครื่องคำนวณผลประโยชน์ทางการเงิน (Wealth & Financial Savings)
function renderWealthTab(finance, carbon) {
  document.getElementById("totalWealthVal").innerText = `฿${finance.totalBenefit.toLocaleString()}`;
  document.getElementById("fuelSavingsVal").innerText = `+฿${finance.fuelSavings.toLocaleString()}`;
  document.getElementById("carbonCreditVal").innerText = `+฿${finance.carbonCreditRevenue.toLocaleString()}`;
  document.getElementById("ricePremiumVal").innerText = `+฿${finance.ricePremiumBonus.toLocaleString()}`;
  document.getElementById("carbonCreditTonsText").innerText = `${carbon.carbonReducedTon} ตัน CO₂-eq`;
  document.getElementById("yieldTonsText").innerText = `${finance.expectedYieldTons} ตันข้าวเปลือก`;
}

// 9. แท็บ 3: เตือนภัยสภาพอากาศ
function renderClimateTab(alerts) {
  const container = document.getElementById("climateAlertsList");
  container.innerHTML = "";
  alerts.forEach(item => {
    const card = document.createElement("div");
    card.className = `alert-card-luxury ${item.level}`;
    card.innerHTML = `
      <div class="alert-title-lux">${item.title}</div>
      <div class="alert-desc-lux">${item.desc}</div>
      <div class="alert-action-lux">
        <span>💡 คำแนะนำ:</span> ${item.action}
      </div>
    `;
    container.appendChild(card);
  });
}

// 10. พยากรณ์อากาศ 7 วันจริง
function renderWeatherForecastStrip(weather) {
  const strip = document.getElementById("weatherStrip");
  strip.innerHTML = "";

  weather.time.forEach((dateStr, idx) => {
    const d = new Date(dateStr);
    const dayName = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric' });
    const maxT = Math.round(weather.temperature_2m_max[idx]);
    const minT = Math.round(weather.temperature_2m_min[idx]);
    const rain = weather.precipitation_sum[idx];

    let icon = "☀️";
    if (rain > 10) icon = "⛈️";
    else if (rain > 1) icon = "🌦️";
    else if (maxT > 35) icon = "🔥";

    const item = document.createElement("div");
    item.className = "weather-day-lux";
    item.innerHTML = `
      <div class="w-date">${dayName}</div>
      <div class="w-icon">${icon}</div>
      <div class="w-temp">${maxT}° / <span style="opacity: 0.6;">${minT}°</span></div>
      <div class="w-rain">${rain > 0 ? rain.toFixed(1) + ' mm' : 'ไม่มีฝน'}</div>
    `;
    strip.appendChild(item);
  });
}

// 11. Event Listeners
function setupUIEventListeners() {
  // สวิตช์เปียกสลับแห้ง (AWD Switch)
  const awdToggle = document.getElementById("awdToggleCheckbox");
  if (awdToggle) {
    awdToggle.addEventListener("change", (e) => {
      isAwdActive = e.target.checked;
      if (currentLayer && currentValidation && currentValidation.isValidRiceField) {
        const carbon = SekModels.calculateCarbonEmissions(currentAreaStats.raiDecimal, isAwdActive, currentWeatherData);
        const finance = SekModels.calculateFinancialBenefits(currentAreaStats.raiDecimal, isAwdActive);
        updateSummaryKPIs(carbon, finance);
        renderCarbonTab(carbon);
        renderWealthTab(finance, carbon);
      }
    });
  }

  // แท็บสลับหน้าจอ
  document.querySelectorAll(".tab-lux-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-lux-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-lux-content").forEach(tc => tc.classList.remove("active"));

      const target = e.currentTarget;
      target.classList.add("active");
      const tabId = target.dataset.tab;
      document.getElementById(tabId).classList.add("active");
    });
  });

  // ปุ่มเครื่องมือวาด
  document.getElementById("btnDrawPlot")?.addEventListener("click", () => {
    new L.Draw.Polygon(map, {
      shapeOptions: { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.35, weight: 3 }
    }).enable();
  });

  document.getElementById("btnDrawCircle")?.addEventListener("click", () => {
    new L.Draw.Circle(map, {
      shapeOptions: { color: '#0284c7', fillColor: '#0284c7', fillOpacity: 0.35, weight: 3 }
    }).enable();
  });

  // ปุ่มสลับแปลงตัวอย่าง
  document.getElementById("btnSamplePlot")?.addEventListener("click", () => {
    samplePlotIndex++;
    loadSamplePlot(samplePlotIndex);
  });

  // ปุ่มรีเซ็ตมุมมองประเทศไทย
  document.getElementById("btnResetView")?.addEventListener("click", () => {
    map.setView([14.0, 100.8], 7);
  });
}

function resetToPromptState() {
  currentLayer = null;
  const hintBox = document.getElementById("drawHintBox");
  if (hintBox) hintBox.style.display = "flex";
  document.getElementById("plotTitle").innerText = "ยังไม่ได้เลือกแปลงนา";
  document.getElementById("plotAreaText").innerText = "กรุณาวงเลือกพื้นที่บนแผนที่ประเทศไทย";
  document.getElementById("plotSqMetersText").innerText = "";
  renderValidationBanner({
    isValidRiceField: false,
    severity: "warning",
    title: "📍 รอการเลือกพื้นที่",
    message: "กรุณาคลิกเครื่องมือ 'วาดแปลงนา' หรือ 'วงเลือกพื้นที่' บนแผนที่ประเทศไทย",
    details: "ระบบพร้อมตรวจสอบความถูกต้องของแปลงทันที"
  });
}
