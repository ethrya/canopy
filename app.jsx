const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ─── NOAA Solar Position ───────────────────────────────────────────────
function toJD(yr, mo, dy, hr) {
  if (mo <= 2) { yr--; mo += 12; }
  const A = Math.floor(yr / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + dy + hr / 24 + B - 1524.5;
}
function getSun(d, lat, lon) {
  const yr = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, dy = d.getUTCDate();
  const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
  const JC = (toJD(yr, mo, dy, hr) - 2451545) / 36525;
  const L0 = (280.46646 + JC * (36000.76983 + .0003032 * JC)) % 360;
  const M = 357.52911 + JC * (35999.05029 - .0001537 * JC);
  const e = .016708634 - JC * (.000042037 + .0000001267 * JC);
  const C = Math.sin(M * Math.PI / 180) * (1.914602 - JC * (.004817 + .000014 * JC))
    + Math.sin(2 * M * Math.PI / 180) * (.019993 - .000101 * JC)
    + Math.sin(3 * M * Math.PI / 180) * .000289;
  const sA = L0 + C - .00569 - .00478 * Math.sin((125.04 - 1934.136 * JC) * Math.PI / 180);
  const ob = 23 + (26 + (21.448 - JC * (46.815 + JC * (.00059 - JC * .001813))) / 60) / 60
    + .00256 * Math.cos((125.04 - 1934.136 * JC) * Math.PI / 180);
  const dec = Math.asin(Math.sin(ob * Math.PI / 180) * Math.sin(sA * Math.PI / 180)) * 180 / Math.PI;
  const y2 = Math.tan(ob * Math.PI / 360) ** 2;
  const eot = 4 * (y2 * Math.sin(2 * L0 * Math.PI / 180) - 2 * e * Math.sin(M * Math.PI / 180)
    + 4 * e * y2 * Math.sin(M * Math.PI / 180) * Math.cos(2 * L0 * Math.PI / 180)
    - .5 * y2 * y2 * Math.sin(4 * L0 * Math.PI / 180)
    - 1.25 * e * e * Math.sin(2 * M * Math.PI / 180)) * 180 / Math.PI;
  let tst = (hr * 60 + eot + 4 * lon) % 1440; if (tst < 0) tst += 1440;
  const ha = tst / 4 - 180, lR = lat * Math.PI / 180, dR = dec * Math.PI / 180;
  const sinAl = Math.sin(lR) * Math.sin(dR) + Math.cos(lR) * Math.cos(dR) * Math.cos(ha * Math.PI / 180);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAl))) * 180 / Math.PI;
  const cAl = Math.cos(alt * Math.PI / 180);
  let az = 0;
  if (cAl > .001) {
    const cosAz = (Math.sin(lR) * sinAl - Math.sin(dR)) / (Math.cos(lR) * cAl);
    const ac = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
    az = ha > 0 ? (ac + 180) % 360 : (540 - ac) % 360;
  }
  return { altitude: alt, azimuth: az };
}

// ─── Layout constants (updated measurements) ──────────────────────────
const LAT = -35.28, LON = 149.13, SC = 75, PAD = 40, NOFF = 12;
const MAX_SH = 25, BALC_H = 2.2, FIXED_HM_MAX = 480;

// Courtyard: 6m wide, 2.7m deep, with 1m×1m NE notch
const CY_POLY = [[0, 0], [5, 0], [5, 1], [6, 1], [6, 2.7], [0, 2.7]];
const CY_AREA = 5 * 1 + 6 * 1.7; // = 5 + 10.2 = 15.2... let me recalc
// Actually: full rect 6×2.7=16.2, minus 1×1 notch = 15.2? No...
// L-shape: bottom rect 6×1.7 (y:1→2.7) = 10.2, plus top rect 5×1 (y:0→1) = 5. Total = 15.2
// But wait, top is 5m wide (x:0→5), 1m tall. Bottom is 6m wide, 1.7m tall (y:1→2.7).
// Total = 5×1 + 6×1.7 = 5 + 10.2 = 15.2m²

// Covered area: 2.6m × 1.5m, south of courtyard at x:0→2.6, y:2.7→4.2
const COV_POLY = [[0, 2.7], [2.6, 2.7], [2.6, 4.2], [0, 4.2]];
const COV_AREA = 2.6 * 1.5; // 3.9m²

// Indoor
const IN_POLY = [[2.6, 2.7], [6, 2.7], [6, 4.2], [2.6, 4.2]];

// Y extent
const Y_MAX = 4.2;

// Wall definitions: [x1, y1, x2, y2, height]
const CY_WALLS = [
  [0, 0, 5, 0, 1.8],       // North wall
  [5, 0, 5, 1, 1.8],       // N step wall
  [5, 1, 6, 1, 1.8],       // Gate
  [6, 1, 6, 2.7, 1.8],     // East wall
  [0, 0, 0, 2.7, 1.8],     // West wall upper
  [0, 2.7, 6, 2.7, 7],     // Building south face
  [6, 2.7, 6, 4.2, 7],     // Building SE
];

// External walls for covered-area raytrace
const EXT_WALLS = [
  { axis: 'y', pos: 0, min: 0, max: 5, h: 1.8 },
  { axis: 'x', pos: 5, min: 0, max: 1, h: 1.8 },
  { axis: 'y', pos: 1, min: 5, max: 6, h: 1.8 },
  { axis: 'x', pos: 6, min: 1, max: 2.7, h: 1.8 },
  { axis: 'x', pos: 0, min: 0, max: 2.7, h: 1.8 },
];

// Visual wall rendering: [x1, y1, x2, y2, height, color]
const VIS_WALLS = [
  [0, 0, 5, 0, 1.8, "#ef4444"],
  [5, 0, 5, 1, 1.8, "#ef4444"],
  [5, 1, 6, 1, 1.8, "#ef4444"],
  [6, 1, 6, 2.7, 1.8, "#ef4444"],
  [0, 0, 0, 2.7, 1.8, "#ef4444"],
  [0, 2.7, 0, 4.2, 2.0, "#eab308"],
  [0, 2.7, 6, 2.7, 7, "#3b82f6"],
  [6, 2.7, 6, 4.2, 7, "#3b82f6"],
  [0, 4.2, 6, 4.2, 7, "#3b82f6"],
  [2.6, 2.7, 2.6, 4.2, 7, "#3b82f6"],
];

const fmtT = m => { const h = Math.floor(m / 60), mn = m % 60, a = h >= 12 ? "pm" : "am"; return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(mn).padStart(2, "0")} ${a}`; };
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ─── Shadow polygon at observation height z ────────────────────────────
function wallShadow(x1, y1, x2, y2, h, trueAz, alt, z) {
  if (alt <= 0.5) return null;
  const effH = h - z;
  if (effH <= 0) return null;
  const az = (trueAz - NOFF) * Math.PI / 180, ar = alt * Math.PI / 180;
  const sl = Math.min(effH / Math.tan(ar), MAX_SH);
  const dx = -sl * Math.sin(az), dy = sl * Math.cos(az);
  return [[x1, y1], [x2, y2], [x2 + dx, y2 + dy], [x1 + dx, y1 + dy]];
}

function ptIn(x, y, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ─── Covered area raytrace at height z ─────────────────────────────────
// Box: x∈[0,2.6], y∈[2.7,4.2], z∈[0,BALC_H]
// Opening: north face y=2.7, x∈[0,2.6], z∈[0,BALC_H]
function isCovLit(px, py, z, planAzDeg, altDeg) {
  if (altDeg <= 0.5) return false;
  const ceilAbove = BALC_H - z;
  if (ceilAbove <= 0) return false;

  const azR = planAzDeg * Math.PI / 180;
  const sinA = Math.sin(azR), cosA = Math.cos(azR);
  const tanAl = Math.tan(altDeg * Math.PI / 180);

  // Ray: (px+t*sinA, py-t*cosA, z+t*tanAl)
  let minT = Infinity, minF = "";

  // North face y=2.7
  if (cosA > 1e-6) { const t = (py - 2.7) / cosA; if (t > 1e-6 && t < minT) { minT = t; minF = "north"; } }
  // South face y=4.2
  if (cosA < -1e-6) { const t = (py - 4.2) / cosA; if (t > 1e-6 && t < minT) { minT = t; minF = "south"; } }
  // West x=0
  if (sinA < -1e-6) { const t = -px / sinA; if (t > 1e-6 && t < minT) { minT = t; minF = "west"; } }
  // East x=2.6
  if (sinA > 1e-6) { const t = (2.6 - px) / sinA; if (t > 1e-6 && t < minT) { minT = t; minF = "east"; } }
  // Ceiling
  if (tanAl > 1e-6) { const t = ceilAbove / tanAl; if (t > 1e-6 && t < minT) { minT = t; minF = "ceiling"; } }

  if (minF !== "north") return false;

  const exitX = px + minT * sinA;
  const exitZ = z + minT * tanAl;
  if (exitX < 0 || exitX > 2.6 || exitZ < 0 || exitZ > BALC_H) return false;

  // Check ray clears courtyard walls
  for (const w of EXT_WALLS) {
    if (w.axis === 'y') {
      if (cosA > 1e-6) {
        const t = (py - w.pos) / cosA;
        if (t > 1e-6) {
          const xAt = px + t * sinA, zAt = z + t * tanAl;
          if (xAt >= w.min && xAt <= w.max && zAt < w.h) return false;
        }
      }
    } else {
      if (sinA > 1e-6 && w.pos > px) {
        const t = (w.pos - px) / sinA;
        if (t > 1e-6) {
          const yAt = py - t * cosA, zAt = z + t * tanAl;
          if (yAt >= w.min && yAt <= w.max && zAt < w.h) return false;
        }
      } else if (sinA < -1e-6 && w.pos < px) {
        const t = (w.pos - px) / sinA;
        if (t > 1e-6) {
          const yAt = py - t * cosA, zAt = z + t * tanAl;
          if (yAt >= w.min && yAt <= w.max && zAt < w.h) return false;
        }
      }
    }
  }
  return true;
}

// ─── Heatmap ───────────────────────────────────────────────────────────
function computeHeatmap(mo, dy, dst, z) {
  const utcOff = dst ? 11 : 10, G = 0.15, INT = 15;
  const cells = [];
  for (let x = G / 2; x < 6.5; x += G) for (let y = G / 2; y < Y_MAX + 0.5; y += G) {
    const inCy = ptIn(x, y, CY_POLY), inCov = ptIn(x, y, COV_POLY);
    if (!inCy && !inCov) continue;
    cells.push({ x, y, zone: inCy ? "open" : "covered", sm: 0 });
  }
  for (let t = 360; t <= 1080; t += INT) {
    const lH = Math.floor(t / 60), lM = t % 60;
    const sun = getSun(new Date(Date.UTC(2025, mo, dy, lH - utcOff, lM)), LAT, LON);
    if (sun.altitude <= 0.5) continue;
    const pAz = sun.azimuth - NOFF;
    const cySh = [];
    for (const w of CY_WALLS) {
      const s = wallShadow(w[0], w[1], w[2], w[3], w[4], sun.azimuth, sun.altitude, z);
      if (s) cySh.push(s);
    }
    for (const c of cells) {
      if (c.zone === "open") {
        let sh = false;
        for (const sp of cySh) { if (sp.length >= 3 && ptIn(c.x, c.y, sp)) { sh = true; break; } }
        if (!sh) c.sm += INT;
      } else {
        if (isCovLit(c.x, c.y, z, pAz, sun.altitude)) c.sm += INT;
      }
    }
  }
  return cells;
}

// ─── Component ─────────────────────────────────────────────────────────
function SolarShadowSimulator() {
  const [month, setMonth] = useState(11);
  const [day, setDay] = useState(21);
  const [timeMin, setTimeMin] = useState(720);
  const [isDST, setIsDST] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [showWR, setShowWR] = useState(true);
  const [tab, setTab] = useState("shadow");
  const [heightCm, setHeightCm] = useState(0);
  const animRef = useRef(null);

  const setPreset = (m, d) => { setMonth(m); setDay(d); setIsDST(!(m >= 4 && m <= 9)); };
  const z = heightCm / 100;

  const covCells = useMemo(() => {
    const S = 0.1, r = [];
    for (let x = S / 2; x < 2.6; x += S) for (let y = 2.7 + S / 2; y < 4.2; y += S) r.push([x, y]);
    return r;
  }, []);

  const compute = useCallback((m, d, t, dst, zH) => {
    const utcOff = dst ? 11 : 10, lH = Math.floor(t / 60), lM = t % 60;
    const sun = getSun(new Date(Date.UTC(2025, m, d, lH - utcOff, lM)), LAT, LON);
    const pAz = sun.azimuth - NOFF;

    if (sun.altitude <= 0.5) {
      return { sun, pAz, cyShad: [[[-3, -3], [10, -3], [10, 8], [-3, 8]]], cyPct: 0, covPct: 0, covLit: [] };
    }

    const cyShad = [];
    for (const w of CY_WALLS) {
      const s = wallShadow(w[0], w[1], w[2], w[3], w[4], sun.azimuth, sun.altitude, zH);
      if (s) cyShad.push(s);
    }

    let cyT = 0, cyS = 0;
    for (let x = .025; x < 6.5; x += .05) for (let y = .025; y < 3.2; y += .05) {
      if (!ptIn(x, y, CY_POLY)) continue;
      cyT++;
      let sh = false;
      for (const sp of cyShad) { if (sp.length >= 3 && ptIn(x, y, sp)) { sh = true; break; } }
      if (!sh) cyS++;
    }

    const covLit = [];
    let covT = 0, covS = 0;
    for (const [cx, cy] of covCells) {
      covT++;
      if (isCovLit(cx, cy, zH, pAz, sun.altitude)) { covS++; covLit.push([cx, cy]); }
    }

    return { sun, pAz, cyShad, cyPct: cyT ? (cyS / cyT) * 100 : 0, covPct: covT ? (covS / covT) * 100 : 0, covLit };
  }, [covCells]);

  const { sun, pAz, cyShad, cyPct, covPct, covLit } = useMemo(
    () => compute(month, day, timeMin, isDST, z),
    [month, day, timeMin, isDST, z, compute]
  );

  const winterRef = useMemo(() => {
    if (!showWR) return [];
    return compute(5, 21, timeMin, false, z).cyShad;
  }, [timeMin, showWR, z, compute]);

  const heatmap = useMemo(() => {
    if (tab !== "heatmap") return null;
    return computeHeatmap(month, day, isDST, z);
  }, [month, day, isDST, tab, z]);

  const hmS = useMemo(() => {
    if (!heatmap) return null;
    const op = heatmap.filter(c => c.zone === "open"), cv = heatmap.filter(c => c.zone === "covered");
    const mx = Math.max(...heatmap.map(c => c.sm), 1);
    return { mx, mxH: mx / 60, aO: op.length ? op.reduce((a, c) => a + c.sm, 0) / op.length / 60 : 0, aC: cv.length ? cv.reduce((a, c) => a + c.sm, 0) / cv.length / 60 : 0 };
  }, [heatmap]);

  const ZONE_DEFS = [
    { id: "fullsun",    label: "Full Sun",    color: "#fbbf24", plants: "Tomato, capsicum, banksia, fruit trees" },
    { id: "summersun",  label: "Summer Sun",  color: "#f59e0b", plants: "Warm-season veggies, basil, zucchini" },
    { id: "partsun",    label: "Part Sun",    color: "#d97706", plants: "Lettuce, herbs, strawberries, silverbeet" },
    { id: "wintersun",  label: "Winter Sun",  color: "#a78bfa", plants: "Cool-season greens, coriander, parsley" },
    { id: "shade",      label: "Shade",       color: "#44403c", plants: "Very limited — ferns, moss" },
  ];

  const classifyZone = (sumH, winH) => {
    if (sumH >= 6 && winH >= 4) return "fullsun";
    if (sumH >= 6) return "summersun";
    if (sumH >= 3) return "partsun";
    if (winH >= 2) return "wintersun";
    return "shade";
  };

  const sunZones = useMemo(() => {
    if (tab !== "zones") return null;
    const summer = computeHeatmap(11, 21, true, z);  // Dec 21 AEDT
    const winter = computeHeatmap(7, 1, false, z);    // Aug 1 AEST
    const cellArea = 0.15 * 0.15; // m² per grid cell
    return summer.map((c, i) => ({
      x: c.x, y: c.y, zone: c.zone,
      sunZone: classifyZone(c.sm / 60, winter[i].sm / 60),
      summerH: c.sm / 60, winterH: winter[i].sm / 60,
    }));
  }, [tab, z]);

  const zoneStats = useMemo(() => {
    if (!sunZones) return null;
    const cellArea = 0.15 * 0.15;
    const counts = {};
    for (const d of ZONE_DEFS) counts[d.id] = 0;
    for (const c of sunZones) counts[c.sunZone]++;
    return ZONE_DEFS.map(d => ({ ...d, area: (counts[d.id] * cellArea).toFixed(1), count: counts[d.id] }));
  }, [sunZones]);

  const exportCSV = useCallback(() => {
    const dates = [
      { label: 'jun21', mo: 5, dy: 21, dst: false },
      { label: 'sep21', mo: 8, dy: 21, dst: false },
      { label: 'dec21', mo: 11, dy: 21, dst: true },
      { label: 'mar21', mo: 2, dy: 21, dst: true },
    ];
    const heights = [0, 0.5, 1.0];
    const results = {};
    for (const d of dates) for (const h of heights) {
      results[`${d.label}_${Math.round(h * 100)}cm`] = computeHeatmap(d.mo, d.dy, d.dst, h);
    }
    const cols = dates.flatMap(d => heights.map(h => `${d.label}_${Math.round(h * 100)}cm`));
    const ref = results[cols[0]];
    let csv = `x,y,zone,${cols.join(',')}\n`;
    for (let i = 0; i < ref.length; i++) {
      const { x, y, zone } = ref[i];
      csv += `${x.toFixed(2)},${y.toFixed(2)},${zone},${cols.map(k => (results[k][i].sm / 60).toFixed(2)).join(',')}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'canopy-sun-hours.csv'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!animating) { if (animRef.current) cancelAnimationFrame(animRef.current); return; }
    let t = 360;
    const step = () => { t += 5; if (t > 1080) { setAnimating(false); return; } setTimeMin(t); animRef.current = requestAnimationFrame(step); };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [animating]);

  const svgW = 6 * SC + PAD * 2, svgH = Y_MAX * SC + PAD * 2;
  const tx = x => PAD + x * SC, ty = y => PAD + y * SC;
  const ps = pts => pts.map(p => `${tx(p[0])},${ty(p[1])}`).join(" ");
  const pAzR = pAz * Math.PI / 180;
  const cCx = tx(6) + 48, cCy = ty(0) + 48, cR = 36, nR = -NOFF * Math.PI / 180;
  const cyCol = cyPct > 60 ? "#f59e0b" : cyPct > 30 ? "#d97706" : cyPct > 0 ? "#92400e" : "#44403c";
  const covPx = 0.1 * SC;

  const hC = (mins, mx) => {
    if (mx <= 0) return "#1a1a1e"; const r = mins / mx;
    if (r < .01) return "#1c1917"; if (r < .15) return "#451a03"; if (r < .3) return "#78350f";
    if (r < .45) return "#92400e"; if (r < .6) return "#b45309"; if (r < .75) return "#d97706";
    if (r < .9) return "#f59e0b"; return "#fbbf24";
  };

  return (
    <div style={{ background: "#1a1a1e", color: "#e8e6e3", fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace", minHeight: "100vh", padding: 20, boxSizing: "border-box" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input[type=range]{-webkit-appearance:none;appearance:none;background:#2a2a30;height:6px;border-radius:3px;outline:none;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#f59e0b;cursor:pointer;border:2px solid #1a1a1e}
        input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#f59e0b;cursor:pointer;border:2px solid #1a1a1e}
        .b{background:#2a2a30;color:#e8e6e3;border:1px solid #3a3a42;padding:6px 12px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;transition:all .15s;white-space:nowrap}
        .b:hover{background:#3a3a42;border-color:#f59e0b}.ba{background:#f59e0b22;border-color:#f59e0b;color:#f59e0b}
        .bm{background:#f59e0b;color:#1a1a1e;border-color:#f59e0b;font-weight:600}.bm:hover{background:#d97706}
        .sc{background:#222228;border:1px solid #2e2e36;border-radius:8px;padding:10px 14px;flex:1;min-width:88px}
        .sl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#78716c;margin-bottom:4px}
        .sv{font-size:18px;font-weight:600}
        .tg{background:#2a2a30;border:1px solid #3a3a42;padding:4px;border-radius:20px;display:flex}
        .to{padding:4px 10px;border-radius:16px;font-size:11px;font-family:inherit;cursor:pointer;transition:all .2s;color:#78716c;background:transparent;border:none}
        .to.a{color:#1a1a1e;background:#f59e0b;font-weight:600}
        .tb{background:none;border:none;color:#78716c;font-family:inherit;font-size:12px;font-weight:500;padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
        .tb:hover{color:#e8e6e3}.tb.a{color:#f59e0b;border-bottom-color:#f59e0b}
        .ht-slider input[type=range]{background:linear-gradient(90deg,#166534,#22c55e)}
        .ht-slider input[type=range]::-webkit-slider-thumb{background:#22c55e;border-color:#1a1a1e}
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#4ade80", letterSpacing: "-.5px" }}>🌿 Canopy</h1>
          <span style={{ fontSize: 10, color: "#57534e", letterSpacing: "1px" }}>SOLAR PLANNER · DOWNER, CANBERRA</span>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg,#4ade8044,transparent)", marginBottom: 12 }} />

        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #2e2e36", marginBottom: 16 }}>
          <button className={`tb ${tab === "shadow" ? "a" : ""}`} onClick={() => setTab("shadow")}>Live Shadows</button>
          <button className={`tb ${tab === "heatmap" ? "a" : ""}`} onClick={() => setTab("heatmap")}>Sun Hours Heatmap</button>
          <button className={`tb ${tab === "zones" ? "a" : ""}`} onClick={() => setTab("zones")}>Planting Map</button>
        </div>

        {/* Height slider */}
        <div className="ht-slider" style={{ background: "#222228", border: "1px solid #2e2e36", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase" }}>🌱 Plant Height</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{heightCm} cm</span>
          </div>
          <input type="range" min={0} max={150} step={10} value={heightCm} onChange={e => setHeightCm(+e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9, color: "#44403c" }}>
            <span>Ground</span><span>50cm</span><span>100cm</span><span>150cm</span>
          </div>
          {heightCm > 0 && <div style={{ fontSize: 9, color: "#4ade80", marginTop: 4 }}>
            Sun exposure at {heightCm}cm — effective wall shadow from 1.8m wall: {Math.max(0, (180 - heightCm)).toFixed(0)}cm equivalent
          </div>}
        </div>

        {/* Stats */}
        {tab === "shadow" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="sc"><div className="sl">Time</div><div className="sv">{fmtT(timeMin)}</div></div>
            <div className="sc"><div className="sl">Date</div><div className="sv">{MO[month]} {day}</div></div>
            <div className="sc"><div className="sl">Altitude</div><div className="sv" style={{ color: sun.altitude > 0 ? "#f59e0b" : "#57534e" }}>{sun.altitude.toFixed(1)}°</div></div>
            <div className="sc"><div className="sl">Azimuth</div><div className="sv">{sun.azimuth.toFixed(1)}°</div></div>
            <div className="sc"><div className="sl">Courtyard</div><div className="sv" style={{ color: cyCol }}>{cyPct.toFixed(0)}%</div></div>
            <div className="sc"><div className="sl">Covered</div><div className="sv" style={{ color: covPct > 0 ? "#a78bfa" : "#44403c" }}>{covPct.toFixed(0)}%</div></div>
          </div>
        )}
        {tab === "heatmap" && hmS && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="sc"><div className="sl">Date</div><div className="sv">{MO[month]} {day}</div></div>
            <div className="sc"><div className="sl">Peak</div><div className="sv" style={{ color: "#f59e0b" }}>{hmS.mxH.toFixed(1)}h</div></div>
            <div className="sc"><div className="sl">Avg Open</div><div className="sv" style={{ color: "#d97706" }}>{hmS.aO.toFixed(1)}h</div></div>
            <div className="sc"><div className="sl">Avg Covered</div><div className="sv" style={{ color: hmS.aC > 0 ? "#a78bfa" : "#44403c" }}>{hmS.aC.toFixed(1)}h</div></div>
          </div>
        )}
        {tab === "zones" && zoneStats && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {zoneStats.filter(s => s.count > 0).map(s => (
              <div className="sc" key={s.id}>
                <div className="sl" style={{ color: s.color }}>{s.label}</div>
                <div className="sv" style={{ color: s.color }}>{s.area}m²</div>
              </div>
            ))}
          </div>
        )}

        {/* SVG */}
        <div style={{ background: "#16161a", border: "1px solid #2e2e36", borderRadius: 10, padding: 8, marginBottom: 16, overflowX: "auto" }}>
          <svg viewBox={`0 0 ${svgW + 110} ${svgH + (tab === "heatmap" || tab === "zones" ? 40 : 10)}`} style={{ width: "100%", maxHeight: tab === "heatmap" || tab === "zones" ? 440 : 400, display: "block" }}>
            <defs>
              <clipPath id="cyc"><polygon points={ps(CY_POLY)} /></clipPath>
              <clipPath id="cvc"><polygon points={ps(COV_POLY)} /></clipPath>
              <pattern id="ih" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#33333a" strokeWidth="1.5" />
              </pattern>
            </defs>

            <polygon points={ps(IN_POLY)} fill="url(#ih)" stroke="#2e2e36" strokeWidth="1" />
            <text x={tx(4.3)} y={ty(3.5)} textAnchor="middle" fill="#44403c" fontSize="10" fontFamily="inherit" fontWeight="500">INDOOR</text>

            {tab === "shadow" && (<>
              <polygon points={ps(COV_POLY)} fill="#1a1a1e" stroke="#2e2e36" strokeWidth="1" />
              {covLit.map((c, i) => (
                <rect key={`cv-${i}`} x={tx(c[0] - .05)} y={ty(c[1] - .05)} width={covPx} height={covPx}
                  fill="#c4b5fd55" stroke="none" clipPath="url(#cvc)" />
              ))}
              <text x={tx(1.3)} y={ty(3.5)} textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="inherit" fontWeight="500">COVERED</text>

              <polygon points={ps(CY_POLY)} fill={sun.altitude > .5 ? "#f59e0b33" : "#1e1e22"} stroke="none" />
              {showWR && winterRef.map((sp, i) => (
                <polygon key={`wr-${i}`} points={ps(sp)} fill="none" stroke="#ef444455" strokeWidth="1" strokeDasharray="4 3" clipPath="url(#cyc)" />
              ))}
              {cyShad.map((sp, i) => (
                <polygon key={`sh-${i}`} points={ps(sp)} fill="rgba(10,10,14,.65)" stroke="none" clipPath="url(#cyc)" />
              ))}
            </>)}

            {tab === "heatmap" && heatmap && hmS && (<>
              <polygon points={ps(COV_POLY)} fill="#1a1a1e" stroke="#2e2e36" strokeWidth="1" />
              <polygon points={ps(CY_POLY)} fill="#1a1a1e" stroke="none" />
              {heatmap.map((c, i) => (
                <rect key={`hm-${i}`} x={tx(c.x - .075)} y={ty(c.y - .075)} width={.15 * SC} height={.15 * SC}
                  fill={hC(c.sm, FIXED_HM_MAX)} clipPath={c.zone === "open" ? "url(#cyc)" : "url(#cvc)"} />
              ))}
              {heatmap.filter((_, i) => i % 31 === 0 && _.sm > 0).map((c, i) => (
                <text key={`hl-${i}`} x={tx(c.x)} y={ty(c.y) + 3} textAnchor="middle"
                  fill="#fff" fontSize="7" fontFamily="inherit" fontWeight="600" opacity=".7">
                  {(c.sm / 60).toFixed(1)}
                </text>
              ))}
              <text x={tx(1.3)} y={ty(3.5)} textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="inherit" fontWeight="500">COVERED</text>
              <g transform={`translate(${tx(0)},${ty(Y_MAX) + 14})`}>
                <text x="0" y="0" fill="#57534e" fontSize="8" fontFamily="inherit" fontWeight="600" letterSpacing="1">SUN HOURS @ {heightCm}cm</text>
                {[0, .15, .3, .45, .6, .75, .9, 1].map((t, i) => (
                  <rect key={`lg-${i}`} x={i * 28} y={6} width={26} height={10} fill={hC(t * FIXED_HM_MAX, FIXED_HM_MAX)} rx="1" />
                ))}
                <text x="0" y={26} fill="#44403c" fontSize="7" fontFamily="inherit">0h</text>
                <text x={7 * 28 + 14} y={26} fill="#44403c" fontSize="7" fontFamily="inherit" textAnchor="middle">8h+</text>
              </g>
            </>)}

            {tab === "zones" && sunZones && (<>
              <polygon points={ps(COV_POLY)} fill="#1a1a1e" stroke="#2e2e36" strokeWidth="1" />
              <polygon points={ps(CY_POLY)} fill="#1a1a1e" stroke="none" />
              {sunZones.map((c, i) => (
                <rect key={`sz-${i}`} x={tx(c.x - .075)} y={ty(c.y - .075)} width={.15 * SC} height={.15 * SC}
                  fill={ZONE_DEFS.find(d => d.id === c.sunZone).color}
                  clipPath={c.zone === "open" ? "url(#cyc)" : "url(#cvc)"} />
              ))}
              <text x={tx(1.3)} y={ty(3.5)} textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="inherit" fontWeight="500">COVERED</text>
              <g transform={`translate(${tx(0)},${ty(Y_MAX) + 14})`}>
                <text x="0" y="0" fill="#57534e" fontSize="8" fontFamily="inherit" fontWeight="600" letterSpacing="1">PLANTING ZONES @ {heightCm}cm</text>
                {ZONE_DEFS.map((d, i) => (
                  <g key={`zl-${i}`}>
                    <rect x={i * 90} y={6} width={12} height={10} fill={d.color} rx="1" />
                    <text x={i * 90 + 16} y={15} fill="#78716c" fontSize="7" fontFamily="inherit">{d.label}</text>
                  </g>
                ))}
              </g>
            </>)}

            <polygon points={ps(CY_POLY)} fill="none" stroke="#57534e" strokeWidth="1.5" />
            <polygon points={ps(COV_POLY)} fill="none" stroke="#44403c" strokeWidth="1" />

            {VIS_WALLS.map((w, i) => (
              <line key={`w-${i}`} x1={tx(w[0])} y1={ty(w[1])} x2={tx(w[2])} y2={ty(w[3])}
                stroke={w[5]} strokeWidth={w[4] >= 7 ? 5 : w[4] >= 2 ? 3.5 : 3} strokeLinecap="round" />
            ))}

            {/* Scale ticks */}
            {[0, 1, 2, 3, 4, 5, 6].map(x => (
              <g key={`sx-${x}`}>
                <line x1={tx(x)} y1={ty(0) - 6} x2={tx(x)} y2={ty(0) - 2} stroke="#44403c" strokeWidth=".8" />
                {x < 6 && <text x={tx(x + .5)} y={ty(0) - 10} textAnchor="middle" fill="#44403c" fontSize="7" fontFamily="inherit">{x}–{x + 1}m</text>}
              </g>
            ))}
            {[0, 1, 2, 3, 4].map(y => (
              <line key={`sy-${y}`} x1={tx(0) - 6} y1={ty(y)} x2={tx(0) - 2} y2={ty(y)} stroke="#44403c" strokeWidth=".8" />
            ))}

            <text x={tx(3)} y={ty(1.4)} textAnchor="middle" fill="#a8a29e" fontSize="10" fontFamily="inherit" fontWeight="500" letterSpacing="2">
              OPEN COURTYARD
            </text>

            {/* North arrow */}
            <g transform={`translate(${tx(-.3)},${ty(.3)}) rotate(${-NOFF})`}>
              <line x1="0" y1="14" x2="0" y2="-14" stroke="#e8e6e3" strokeWidth="1.5" />
              <polygon points="0,-16 -4,-8 4,-8" fill="#e8e6e3" />
              <text x="0" y="-20" textAnchor="middle" fill="#e8e6e3" fontSize="10" fontFamily="inherit" fontWeight="700">N</text>
            </g>

            {/* Compass */}
            <g>
              <circle cx={cCx} cy={cCy} r={cR} fill="none" stroke="#2e2e36" strokeWidth="1" />
              {["N", "E", "S", "W"].map((d, i) => {
                const a = i * 90 * Math.PI / 180 + nR;
                return <text key={d} x={cCx + (cR + 10) * Math.sin(a)} y={cCy - (cR + 10) * Math.cos(a) + 3}
                  textAnchor="middle" fill={d === "N" ? "#e8e6e3" : "#57534e"} fontSize="8" fontFamily="inherit" fontWeight={d === "N" ? "700" : "600"}>{d}</text>;
              })}
              {sun.altitude > 0 && tab === "shadow" && (
                <g>
                  <line x1={cCx} y1={cCy} x2={cCx + (cR - 12) * Math.sin(pAzR)} y2={cCy - (cR - 12) * Math.cos(pAzR)}
                    stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <circle cx={cCx + (cR - 12) * Math.sin(pAzR)} cy={cCy - (cR - 12) * Math.cos(pAzR)} r="4" fill="#f59e0b" />
                </g>
              )}
              <text x={cCx} y={cCy + cR + 22} textAnchor="middle" fill="#57534e" fontSize="7" fontFamily="inherit">
                {tab === "shadow" ? "SUN POSITION" : "ORIENTATION"}
              </text>
            </g>

            {/* Legend */}
            <g transform={`translate(${tx(6) + 24},${ty(2)})`}>
              <text x="0" y="0" fill="#57534e" fontSize="7" fontFamily="inherit" fontWeight="600" letterSpacing="1">WALLS</text>
              <line x1="0" y1="10" x2="14" y2="10" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
              <text x="18" y="13" fill="#78716c" fontSize="7" fontFamily="inherit">1.8m brick</text>
              <line x1="0" y1="24" x2="14" y2="24" stroke="#eab308" strokeWidth="3" strokeLinecap="round" />
              <text x="18" y="27" fill="#78716c" fontSize="7" fontFamily="inherit">2.0m brick</text>
              <line x1="0" y1="38" x2="14" y2="38" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
              <text x="18" y="41" fill="#78716c" fontSize="7" fontFamily="inherit">7m bldg</text>
              {showWR && tab === "shadow" && <>
                <line x1="0" y1="54" x2="14" y2="54" stroke="#ef444455" strokeWidth="1" strokeDasharray="4 3" />
                <text x="18" y="57" fill="#78716c" fontSize="7" fontFamily="inherit">Jun 21</text>
              </>}
            </g>
          </svg>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tab === "shadow" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase" }}>Time of Day</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>{fmtT(timeMin)}</span>
              </div>
              <input type="range" min={360} max={1080} step={15} value={timeMin} onChange={e => setTimeMin(+e.target.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9, color: "#44403c" }}>
                <span>6:00 am</span><span>12:00 pm</span><span>6:00 pm</span>
              </div>
            </div>
          )}

          {tab !== "zones" && (<>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase" }}>Date</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#e8e6e3" }}>{MO[month]} {day}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#44403c", marginBottom: 3 }}>Month</div>
                <input type="range" min={0} max={11} step={1} value={month}
                  onChange={e => { const m = +e.target.value; setMonth(m); if (day > DIM[m]) setDay(DIM[m]); }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#44403c", marginBottom: 3 }}>Day</div>
                <input type="range" min={1} max={DIM[month]} step={1} value={day} onChange={e => setDay(+e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#57534e", letterSpacing: "1px", marginRight: 4 }}>PRESETS</span>
            <button className="b" onClick={() => setPreset(5, 21)}>❄ Winter Solstice</button>
            <button className="b" onClick={() => setPreset(2, 21)}>🌗 Mar Equinox</button>
            <button className="b" onClick={() => setPreset(8, 21)}>🌗 Sep Equinox</button>
            <button className="b" onClick={() => setPreset(11, 21)}>☀ Summer Solstice</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="tg">
              <button className={`to ${!isDST ? "a" : ""}`} onClick={() => setIsDST(false)}>AEST</button>
              <button className={`to ${isDST ? "a" : ""}`} onClick={() => setIsDST(true)}>AEDT</button>
            </div>
            {tab === "shadow" && <>
              <button className={`b ${animating ? "ba" : "bm"}`}
                onClick={() => { if (!animating) { setTimeMin(360); setAnimating(true); } else setAnimating(false); }}>
                {animating ? "⏸ Pause" : "▶ Animate Day"}
              </button>
              <button className={`b ${showWR ? "ba" : ""}`} onClick={() => setShowWR(!showWR)}>
                {showWR ? "✓" : ""} Jun 21 Overlay
              </button>
            </>}
            <button className="b" onClick={() => { setPreset(5, 21); setTimeMin(720); }}>Worst Day</button>
            <button className="b" onClick={() => { setPreset(11, 21); setTimeMin(720); }}>Best Day</button>
            <button className="b" onClick={exportCSV}>📊 Export CSV</button>
          </div>
          </>)}

          {tab === "zones" && zoneStats && (
            <div style={{ background: "#222228", border: "1px solid #2e2e36", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>Plant Suggestions</div>
              {zoneStats.filter(s => s.count > 0).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: s.color, fontWeight: 600, minWidth: 90 }}>{s.label}</span>
                  <span style={{ fontSize: 10, color: "#78716c" }}>{s.plants}</span>
                </div>
              ))}
              <div style={{ fontSize: 9, color: "#44403c", marginTop: 8 }}>Based on Dec 21 (summer) + Aug 1 (winter) sun hours{heightCm > 0 ? ` at ${heightCm}cm` : ""}</div>
            </div>
          )}
        </div>

        {/* Bars */}
        {tab === "shadow" && (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <div style={{ flex: 2, background: "#222228", borderRadius: 8, border: "1px solid #2e2e36", padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase" }}>Open Courtyard</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: cyCol }}>{cyPct.toFixed(0)}%</span>
              </div>
              <div style={{ background: "#1a1a1e", borderRadius: 4, height: 10, overflow: "hidden" }}>
                <div style={{ width: `${cyPct}%`, height: "100%", background: "linear-gradient(90deg,#92400e,#f59e0b)", borderRadius: 4, transition: animating ? "none" : "width .3s ease" }} />
              </div>
            </div>
            <div style={{ flex: 1, background: "#222228", borderRadius: 8, border: "1px solid #2e2e36", padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#78716c", letterSpacing: "1px", textTransform: "uppercase" }}>Covered</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: covPct > 0 ? "#a78bfa" : "#44403c" }}>{covPct.toFixed(0)}%</span>
              </div>
              <div style={{ background: "#1a1a1e", borderRadius: 4, height: 10, overflow: "hidden" }}>
                <div style={{ width: `${covPct}%`, height: "100%", background: "linear-gradient(90deg,#6d28d9,#a78bfa)", borderRadius: 4, transition: animating ? "none" : "width .3s ease" }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 9, color: "#3a3a42", textAlign: "center" }}>
          🌿 Canopy · NOAA solar position · N offset {NOFF}° · Courtyard 6×2.7m · Covered 2.6×1.5m · {heightCm > 0 ? `Height ${heightCm}cm · ` : ""}2.2m balcony · 7m building
        </div>
      </div>
    </div>
  );
}
