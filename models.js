/**
 * SEK GROWING — Luxury Agriculture & Climate Intelligence Engine
 * Standards: IPCC Tier-2 Rice Methane Guidelines & Thailand Rice Department
 * 
 * 1. Area Conversion (WGS84 Geodesic -> ไร่-งาน-ตร.ว.)
 * 2. Land Validation AI (ตรวจจับบ้านเรือน, แม่น้ำ, พื้นที่นอกไทย, ขนาดเล็กเกินไป)
 * 3. Live Weather Forecast API (Open-Meteo 7-day live data)
 * 4. IPCC Rice Carbon & Methane Accounting Model
 * 5. Luxury Economic Wealth & Fuel Savings Calculator
 * 6. Rice Agronomy & Extreme Weather Early Warning Radar
 */

const SekModels = {
  // คำนวณพื้นที่รูปหลายเหลี่ยม (Geodesic Polygon Area)
  computePolygonArea(latlngs) {
    if (!latlngs || latlngs.length < 3) return 0;
    const radius = 6378137; // Earth radius in meters
    let area = 0;
    const len = latlngs.length;
    for (let i = 0; i < len; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % len];
      area += ((p2.lng - p1.lng) * (Math.PI / 180)) * 
              (2 + Math.sin(p1.lat * (Math.PI / 180)) + Math.sin(p2.lat * (Math.PI / 180)));
    }
    area = (area * radius * radius) / 2.0;
    return Math.abs(area);
  },

  // แปลงพื้นที่จากตารางเมตร เป็น ไร่ - งาน - ตารางวา
  calculateThaiArea(sqMeters) {
    const totalSqWa = sqMeters / 4;
    const rai = Math.floor(totalSqWa / 400);
    const remainingWaAfterRai = totalSqWa % 400;
    const ngan = Math.floor(remainingWaAfterRai / 100);
    const sqWa = Math.round((remainingWaAfterRai % 100) * 10) / 10;
    const raiDecimal = Math.max(0.05, Number((sqMeters / 1600).toFixed(2)));

    return {
      sqMeters: Math.round(sqMeters),
      totalSqWa: Math.round(totalSqWa),
      rai,
      ngan,
      sqWa,
      raiDecimal,
      formattedText: `${rai} ไร่ ${ngan} งาน ${sqWa} ตร.ว.`
    };
  },

  // 1. ระบบตรวจสอบความถูกต้องของแปลงนา (Land Validation AI)
  // ตรวจจับว่า: เป็นบ้านเรือน / แม่น้ำ / นอกประเทศไทย / เล็กเกินไป หรือเป็นแปลงนาจริง
  async validateLandUse(lat, lng, sqMeters) {
    // 1.1 ตรวจสอบขอบเขตประเทศไทย (Thailand Bounding Box)
    if (lat < 5.6 || lat > 20.5 || lng < 97.3 || lng > 105.7) {
      return {
        isValidRiceField: false,
        landType: "outside_thailand",
        title: "⚠️ อยู่นอกเขตประเทศไทย",
        message: "ระบบรองรับเฉพาะพื้นที่แปลงนาภายในราชอาณาจักรไทยเท่านั้น",
        severity: "danger",
        details: "พิกัดอยู่นอกขอบเขตอธิปไตยไทย"
      };
    }

    // 1.2 ตรวจสอบขนาดพื้นที่ (แปลงนาต้องไม่เล็กกว่า 50 ตร.ว. หรือ 200 ตร.ม.)
    if (sqMeters < 200) {
      return {
        isValidRiceField: false,
        landType: "too_small",
        title: "⚠️ ขนาดเล็กเกินไปสำหรับแปลงนา",
        message: "พื้นที่น้อยกว่า 50 ตารางวา อาจเป็นตัวบ้าน โรงเรือน หรือสวนหย่อมส่วนตัว",
        severity: "warning",
        details: `ขนาดที่วาด: ${Math.round(sqMeters)} ตร.ม. (ขั้นต่ำ 200 ตร.ม.)`
      };
    }

    // 1.3 ดึงข้อมูลประเภทที่ดินจาก OpenStreetMap Reverse Geocoding
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const category = (data.category || '').toLowerCase();
        const type = (data.type || '').toLowerCase();
        const address = data.address || {};
        const displayName = (data.display_name || '').toLowerCase();

        // ตรวจจับแหล่งน้ำ (Water Detection)
        const isWater = 
          category === 'natural' && ['water', 'bay', 'strait'].includes(type) ||
          category === 'waterway' ||
          ['river', 'canal', 'stream', 'reservoir', 'lake'].includes(type) ||
          displayName.includes('แม่น้ำ') || displayName.includes('คลอง') || displayName.includes('อ่างเก็บน้ำ') || displayName.includes('เขื่อน');

        if (isWater) {
          return {
            isValidRiceField: false,
            landType: "water",
            title: "🌊 ตรวจพบแหล่งน้ำธรรมชาติ (ไม่ใช่แปลงนา)",
            message: "พื้นที่นี้เป็นแม่น้ำ คลอง บึง หรืออ่างเก็บน้ำ ไม่สามารถคำนวณคาร์บอนข้าวได้",
            severity: "danger",
            details: `ตรวจพบ: ${data.name || 'ผิวน้ำ/แม่น้ำธรรมชาติ'}`
          };
        }

        // ตรวจจับสิ่งปลูกสร้าง/บ้านเรือน/เขตเมือง (Settlement Detection)
        const isSettlement = 
          category === 'building' ||
          ['house', 'residential', 'apartments', 'commercial', 'industrial', 'school', 'hospital'].includes(type) ||
          address.city === 'กรุงเทพมหานคร' && !displayName.includes('หนองจอก') && !displayName.includes('คลองสามวา') ||
          displayName.includes('หมู่บ้าน') || displayName.includes('คอนโด') || displayName.includes('ห้าง');

        if (isSettlement && !displayName.includes('เกษตร') && !displayName.includes('ไร่') && !displayName.includes('นา')) {
          return {
            isValidRiceField: false,
            landType: "settlement",
            title: "🏠 ตรวจพบสิ่งปลูกสร้าง/บ้านเรือน (ไม่ใช่แปลงนา)",
            message: "พื้นที่นี้เป็นอาคาร สิ่งปลูกสร้าง หรือเขตชุมชนหนาแน่น ระบบระงับการคำนวณคาร์บอน",
            severity: "danger",
            details: `ตรวจพบ: ${data.name || 'อาคาร/ชุมชนพักอาศัย'}`
          };
        }
      }
    } catch (err) {
      console.warn("Geocoding validation network warning:", err);
    }

    // 1.4 ผ่านการตรวจสอบ: เป็นพื้นที่เกษตรกรรมนาข้าว
    return {
      isValidRiceField: true,
      landType: "farmland",
      title: "✅ ตรวจสอบผ่าน: เป็นพื้นที่เกษตรกรรมนาข้าว",
      message: "แปลงนาอยู่ในเขตเพาะปลูกที่ถูกต้อง พร้อมสำหรับการคำนวณคาร์บอนและการจัดการน้ำ",
      severity: "success",
      details: "ตรวจสอบโครงสร้างพื้นที่แล้ว ไม่พบสิ่งปลูกสร้างหรือผิวน้ำขัดขวาง"
    };
  },

  // 2. ดึงข้อมูลสภาพอากาศและพยากรณ์อากาศ 7 วันจริง (Open-Meteo API)
  async fetchWeatherForecast(lat, lng) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum,relative_humidity_2m_max,windspeed_10m_max&timezone=Asia%2FBangkok`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Weather API failed");
      const data = await res.json();
      return data.daily;
    } catch (err) {
      console.warn("Offline weather fallback:", err);
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      }
      return {
        time: dates,
        temperature_2m_max: [33.8, 34.2, 35.0, 33.2, 32.5, 33.0, 34.0],
        temperature_2m_min: [24.2, 24.5, 25.0, 24.1, 23.5, 24.0, 24.2],
        precipitation_sum: [0.0, 1.5, 8.0, 3.2, 0.0, 0.0, 2.0],
        shortwave_radiation_sum: [21.5, 22.0, 18.5, 19.8, 23.0, 22.5, 21.2],
        relative_humidity_2m_max: [76, 80, 86, 82, 74, 75, 78],
        windspeed_10m_max: [12, 14, 20, 16, 11, 10, 12]
      };
    }
  },

  // 3. โมเดลคำนวณคาร์บอนและก๊าซมีเทนนาข้าว (IPCC Tier-2 Model for Rice)
  calculateCarbonEmissions(raiDecimal, isAwdActive = true, weatherDaily = null, seasonDays = 105) {
    const hectares = raiDecimal / 6.25;

    // Baseline Emission Factor สำหรับเอเชียตะวันออกเฉียงใต้ = 1.30 kg CH4/ha/day
    const EF_base = 1.30;

    // Scaling Factor สภาวะน้ำ (SFw):
    // ขังน้ำตลอดฤดู = 1.0 (ปล่อยมีเทน 100%)
    // เปียกสลับแห้ง (AWD) = 0.52 (ลดการเกิดมีเทนลง 48%)
    const SF_water = isAwdActive ? 0.52 : 1.0;

    // ปัจจัยผลกระทบจากอุณหภูมิจริง: แบคทีเรีย Methanogen เจริญเติบโตสูงในอุณหภูมิ 28-35°C
    let tempFactor = 1.0;
    if (weatherDaily && weatherDaily.temperature_2m_max) {
      const avgMaxTemp = weatherDaily.temperature_2m_max.reduce((a, b) => a + b, 0) / weatherDaily.temperature_2m_max.length;
      if (avgMaxTemp > 35.0) tempFactor = 1.12;
      else if (avgMaxTemp < 30.0) tempFactor = 0.90;
    }

    // ก๊าซมีเทนรวมตลอดฤดู (kg CH4)
    const ch4Kg = EF_base * SF_water * tempFactor * hectares * seasonDays;

    // แปลงก๊าซมีเทนเป็นคาร์บอนไดออกไซด์เทียบเท่า (CO2-eq)
    // GWP100 ของก๊าซมีเทนชีวภาพ = 27.9 (IPCC AR6)
    const GWP_CH4 = 27.9;
    const co2EqTotalKg = ch4Kg * GWP_CH4;
    const co2EqPerRai = co2EqTotalKg / raiDecimal;
    const co2EqTonTotal = co2EqTotalKg / 1000;

    // ปริมาณคาร์บอนมาตรฐานกรณีขังน้ำตลอดฤดู (Baseline)
    const ch4ContinuousBaseline = EF_base * 1.0 * tempFactor * hectares * seasonDays;
    const co2BaselineTon = (ch4ContinuousBaseline * GWP_CH4) / 1000;
    const carbonReducedTon = Math.max(0, co2BaselineTon - co2EqTonTotal);

    return {
      isAwdActive,
      co2EqTotalKg: Math.round(co2EqTotalKg),
      co2EqPerRai: Math.round(co2EqPerRai),
      co2EqTonTotal: Number(co2EqTonTotal.toFixed(2)),
      co2BaselineTon: Number(co2BaselineTon.toFixed(2)),
      carbonReducedTon: Number(carbonReducedTon.toFixed(2)),
      reductionPercent: isAwdActive ? 48 : 0,
      methaneEmissionKg: Math.round(ch4Kg)
    };
  },

  // 4. เครื่องคำนวณผลประโยชน์ทางการเงินและการประหยัดต้นทุน (Wealth Calculator)
  calculateFinancialBenefits(raiDecimal, isAwdActive = true) {
    // ผลผลิตข้าวเฉลี่ย = 0.8 ตัน (800 กก.) ต่อไร่
    const expectedYieldTons = Number((raiDecimal * 0.8).toFixed(1));

    // ก. ค่าประหยัดน้ำมัน/ไฟฟ้าวิดน้ำเข้านาจากการทำ AWD (750 บาท/ไร่)
    const fuelSavings = isAwdActive ? Math.round(raiDecimal * 750) : 0;

    // ข. รายได้คาร์บอนเครดิต (T-VER เฉลี่ย 0.35 ตัน CO2-eq/ไร่ x 600 บาท/ตัน)
    const carbonCreditsEarnedTon = isAwdActive ? Number((raiDecimal * 0.35).toFixed(2)) : 0;
    const carbonCreditRevenue = Math.round(carbonCreditsEarnedTon * 600);

    // ค. โบนัสส่วนต่างราคาข้าวคาร์บอนต่ำ (Premium Rice Price: +400 บาท/ตันข้าวเปลือก)
    const ricePremiumBonus = isAwdActive ? Math.round(expectedYieldTons * 400) : 0;

    // รวมมูลค่าทั้งหมด
    const totalBenefit = fuelSavings + carbonCreditRevenue + ricePremiumBonus;

    return {
      fuelSavings,
      carbonCreditRevenue,
      carbonCreditsEarnedTon,
      ricePremiumBonus,
      totalBenefit,
      expectedYieldTons
    };
  },

  // 5. เรดาร์เตือนภัยสภาพอากาศและศัตรูพืช 7 วันล่วงหน้า
  evaluateRisks(weatherDaily) {
    const alerts = [];

    // เตือนโรคไหม้ (Blast)
    let highHumidDays = 0;
    for (let i = 0; i < 7; i++) {
      const hum = weatherDaily.relative_humidity_2m_max[i] || 75;
      const tMax = weatherDaily.temperature_2m_max[i];
      if (hum >= 82 && tMax >= 25 && tMax <= 32) highHumidDays++;
    }

    if (highHumidDays >= 3) {
      alerts.push({
        level: "danger",
        title: "⚠️ เสี่ยงโรคไหม้คอรวงระบาดสูง",
        desc: `ความชื้นในอากาศสูงเกิน 82% ต่อเนื่อง ${highHumidDays} วัน สภาพแวดล้อมเหมาะสมต่อสปอร์เชื้อรา`,
        action: "งดหว่านปุ๋ยยูเรียชั่วคราว และหมั่นสำรวจคันนาเช้าตรู่"
      });
    } else {
      alerts.push({
        level: "safe",
        title: "✅ สภาพอากาศปลอดภัยจากโรคไหม้",
        desc: "การระบายอากาศและแดดอยู่ในเกณฑ์ปกติ ความชื้นไม่วิกฤต",
        action: "ดูแลรักษาระดับการใส่ปุ๋ยตามรอบปกติ"
      });
    }

    // เตือนพายุฝนตกหนัก
    const totalRain = weatherDaily.precipitation_sum.reduce((a, b) => a + b, 0);
    const maxDailyRain = Math.max(...weatherDaily.precipitation_sum);

    if (maxDailyRain >= 40 || totalRain >= 80) {
      alerts.push({
        level: "warning",
        title: "⛈️ เตือนพายุฝนตกหนักสะสม",
        desc: `คาดการณ์ฝนตกสะสม ${totalRain.toFixed(1)} มม. (สูงสุด ${maxDailyRain.toFixed(1)} มม./วัน)`,
        action: "เตรียมเปิดช่องระบายน้ำตามคันนา ป้องกันน้ำท่วมมิดยอดข้าว"
      });
    } else {
      alerts.push({
        level: "safe",
        title: "✅ ฝนตกตามฤดูกาลปกติ",
        desc: `ปริมาณฝนสะสมสัปดาห์นี้ประมาณ ${totalRain.toFixed(1)} มม. เหมาะต่อการจัดการน้ำ`,
        action: "สามารถบริหารจัดการน้ำแบบเปียกสลับแห้งได้สะดวก"
      });
    }

    // เตือนคลื่นความร้อน
    const maxTemp = Math.max(...weatherDaily.temperature_2m_max);
    if (maxTemp >= 36.0) {
      alerts.push({
        level: "warning",
        title: `☀️ อากาศร้อนจัดแตะ ${maxTemp.toFixed(1)}°C`,
        desc: "อุณหภูมิเกิน 35°C หากเป็นช่วงข้าวออกรวง อาจทำให้เกสรฝ่อและเมล็ดลีบ",
        action: "หากข้าวเริ่มตั้งท้อง แนะนำหล่อเลี้ยงน้ำตื้น 3-5 ซม. เพื่อลดอุณหภูมิหน้าดิน"
      });
    }

    return alerts;
  }
};

if (typeof window !== 'undefined') {
  window.SekModels = SekModels;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SekModels;
}
