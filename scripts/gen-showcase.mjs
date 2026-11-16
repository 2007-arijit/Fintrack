/**
 * Generates the five FinTrack "Vision" showcase scenes as 1600Ã—1000 SVG key art.
 *
 * Run: node scripts/gen-showcase.mjs
 * Output: public/media/showcase/showcase-*.svg
 *
 * Deterministic, dependency-free. Adjust the seed or palette here rather than
 * hand-editing the generated SVGs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/media/showcase");
const W = 1600;
const H = 1000;

function mulberry32(seed) {
  let a = seed;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (v) => Number(v.toFixed(2));

function smoothPath(points, closed = false) {
  const n = points.length;
  if (n < 2) return "";
  const at = (i) => points[closed ? (i + n) % n : Math.min(n - 1, Math.max(0, i))];
  let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

function organicLoop(cx, cy, radius, phase, squashX = 1.34, squashY = 0.78, points = 56) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r =
      radius *
      (1 +
        0.085 * Math.sin(3 * a + phase) +
        0.045 * Math.sin(7 * a + phase * 2.1) +
        0.026 * Math.cos(11 * a + phase * 3.7));
    pts.push([cx + Math.cos(a) * r * squashX, cy + Math.sin(a) * r * squashY]);
  }
  return smoothPath(pts, true);
}

function grainAndVignette() {
  return `
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.075" style="mix-blend-mode:soft-light"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" fill="none" stroke="#f0a03a" stroke-opacity="0.05"/>`;
}

function baseDefs(accent = "amber", lift = 1) {
  const liftR = (1.9 * lift).toFixed(2);
  const liftG = (1.75 * lift).toFixed(2);
  const liftB = (1.55 * lift).toFixed(2);
  return `
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="78%">
      <stop offset="0%" stop-color="#2a1e12"/>
      <stop offset="46%" stop-color="#171310"/>
      <stop offset="100%" stop-color="#0b0908"/>
    </radialGradient>
    <linearGradient id="amber" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#7a4209"/>
      <stop offset="42%" stop-color="#e2902b"/>
      <stop offset="78%" stop-color="#ffc46a"/>
      <stop offset="100%" stop-color="#ffe9bf"/>
    </linearGradient>
    <linearGradient id="amberSoft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffd58f" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#e2902b" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#7a4209" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="teal" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#173f33"/>
      <stop offset="55%" stop-color="#3d8f70"/>
      <stop offset="100%" stop-color="#7fdec0"/>
    </linearGradient>
    <linearGradient id="tealSoft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7fdec0" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#173f33" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#33271a" stop-opacity="0.94"/>
      <stop offset="48%" stop-color="#17120d" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#0b0907" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffe2a8" stop-opacity="0.9"/>
      <stop offset="52%" stop-color="#bd7620" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#5f350a" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffcf82" stop-opacity="${accent === "amber" ? "0.3" : "0.14"}"/>
      <stop offset="55%" stop-color="#e2902b" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#e2902b" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="74%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="62%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.52"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="46%" r="74%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.56"/>
    </radialGradient>
    <radialGradient id="warmCore" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffd58f" stop-opacity="0.7"/>
      <stop offset="34%" stop-color="#e2902b" stop-opacity="0.3"/>
      <stop offset="70%" stop-color="#9a530f" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="tealCore" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7fdec0" stop-opacity="0.55"/>
      <stop offset="42%" stop-color="#3d8f70" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="blur8" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur20" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="blur48" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="48"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <!-- Display grade: the scenes are drawn for a dark stage, so lift the
         mid-tones and warmth here instead of brightening every shape. -->
    <filter id="grade" color-interpolation-filters="sRGB">
      <feComponentTransfer>
        <feFuncR type="linear" slope="${liftR}" intercept="0.03"/>
        <feFuncG type="linear" slope="${liftG}" intercept="0.024"/>
        <feFuncB type="linear" slope="${liftB}" intercept="0.018"/>
      </feComponentTransfer>
    </filter>
  </defs>`;
}

function svg(body, defs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
${defs}
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g filter="url(#grade)">
${body}
${grainAndVignette()}
</g>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* 01 â€” The Ledger: stacked smoke-glass ledgers in a warm light shaft  */
/* ------------------------------------------------------------------ */
function sceneLedger() {
  const rand = mulberry32(88123);
  const panels = [
    { cx: 612, cy: 468, w: 720, h: 424, rot: -9, op: 0.34, blur: 1.1, detail: 0 },
    { cx: 714, cy: 486, w: 700, h: 424, rot: -7, op: 0.52, blur: 0.55, detail: 1 },
    { cx: 818, cy: 505, w: 676, h: 420, rot: -5, op: 0.74, blur: 0.2, detail: 2 },
    { cx: 912, cy: 524, w: 624, h: 396, rot: -3, op: 1, blur: 0, detail: 3 },
  ];

  const panelMarkup = panels
    .map((p, index) => {
      const left = p.cx - p.w / 2;
      const top = p.cy - p.h / 2;
      const right = left + p.w;
      const bottom = top + p.h;
      const clip = `ledger-clip-${index}`;
      const rows = Array.from({ length: 8 }, (_, r) => {
        const y = top + 92 + r * 30;
        const w1 = 120 + rand() * 220;
        const w2 = 42 + rand() * 54;
        return `
          <circle cx="${fmt(left + 40)}" cy="${fmt(y)}" r="3" fill="#f0a03a" opacity="${fmt(0.22 + rand() * 0.28)}"/>
          <rect x="${fmt(left + 58)}" y="${fmt(y - 1.5)}" width="${fmt(w1)}" height="3" rx="1.5" fill="#f0a03a" opacity="${fmt(0.1 + rand() * 0.12)}"/>
          <rect x="${fmt(right - 46 - w2)}" y="${fmt(y - 1.5)}" width="${fmt(w2)}" height="3" rx="1.5" fill="#45a07a" opacity="${fmt(0.12 + rand() * 0.16)}"/>`;
      }).join("");

      const grid = Array.from({ length: 12 }, (_, g) => {
        const y = top + ((g + 1) * p.h) / 13;
        return `<line x1="${fmt(left + 14)}" y1="${fmt(y)}" x2="${fmt(right - 14)}" y2="${fmt(y)}" stroke="#f0a03a" stroke-opacity="${g % 4 === 0 ? "0.09" : "0.045"}" stroke-width="1"/>`;
      }).join("");
      const columns = Array.from({ length: 7 }, (_, g) => {
        const x = left + ((g + 1) * p.w) / 8;
        return `<line x1="${fmt(x)}" y1="${fmt(top + 16)}" x2="${fmt(x)}" y2="${fmt(bottom - 16)}" stroke="#f0a03a" stroke-opacity="0.035" stroke-width="1"/>`;
      }).join("");

      const bars =
        p.detail === 3
          ? Array.from({ length: 7 }, (_, b) => {
              const bw = 22;
              const gap = 16;
              const x = right - 56 - (6 - b) * (bw + gap);
              const bh = 34 + b * 17 + rand() * 10;
              return `<rect x="${fmt(x)}" y="${fmt(bottom - 38 - bh)}" width="${bw}" height="${fmt(bh)}" rx="4" fill="url(#amberSoft)" opacity="${fmt(0.26 + b * 0.075)}"/>`;
            }).join("")
          : "";

      const spark =
        p.detail >= 2
          ? (() => {
              const pts = Array.from({ length: 9 }, (_, s) => [
                left + 50 + (s * (p.w - 100)) / 8,
                top + p.h * 0.56 - Math.sin(s * 1.15 + index) * 34 - s * 5 + rand() * 8,
              ]);
              return `<path d="${smoothPath(pts)}" stroke="url(#teal)" stroke-width="${p.detail === 3 ? 2.4 : 1.6}" stroke-opacity="${p.detail === 3 ? 0.75 : 0.35}" fill="none" filter="url(#blur3)"/>
              <path d="${smoothPath(pts)}" stroke="#7fdec0" stroke-width="1.2" stroke-opacity="${p.detail === 3 ? 0.55 : 0.2}" fill="none"/>`;
            })()
          : "";

      return `
      <g transform="translate(${p.cx} ${p.cy}) rotate(${p.rot}) translate(${-p.cx} ${-p.cy})" opacity="${p.op}"${p.blur ? ` filter="url(#blur3)"` : ""}>
        <rect x="${fmt(left + 10)}" y="${fmt(top + 26)}" width="${p.w}" height="${p.h}" rx="22" fill="#000" opacity="0.58" filter="url(#blur20)"/>
        <rect x="${fmt(left)}" y="${fmt(top)}" width="${p.w}" height="${p.h}" rx="20" fill="url(#glass)" stroke="url(#edge)" stroke-width="1.5"/>
        <rect x="${fmt(left + 1)}" y="${fmt(top + 1)}" width="${p.w - 2}" height="1.5" rx="0.75" fill="#ffe2a8" opacity="0.5"/>
        <rect x="${fmt(left + 1)}" y="${fmt(top + 1)}" width="1.5" height="${p.h - 2}" rx="0.75" fill="url(#amberSoft)" opacity="0.5"/>
        <clipPath id="${clip}"><rect x="${fmt(left)}" y="${fmt(top)}" width="${p.w}" height="${p.h}" rx="20"/></clipPath>
        <g clip-path="url(#${clip})">
          ${grid}
          ${columns}
          ${rows}
          ${bars}
          ${spark}
          <rect x="${fmt(left)}" y="${fmt(bottom - 58)}" width="${p.w}" height="58" fill="#050403" opacity="0.32"/>
          <rect x="${fmt(left + 34)}" y="${fmt(top + 30)}" width="${fmt(80 + rand() * 90)}" height="7" rx="3.5" fill="#f0a03a" opacity="0.32"/>
          <circle cx="${fmt(right - 44)}" cy="${fmt(top + 34)}" r="4" fill="#7fdec0" opacity="0.65"/>
          <circle cx="${fmt(right - 62)}" cy="${fmt(top + 34)}" r="4" fill="#f0a03a" opacity="0.5"/>
        </g>
      </g>`;
    })
    .join("");

  const dust = Array.from({ length: 46 }, () => {
    const x = 220 + rand() * 1160;
    const y = 120 + rand() * 760;
    const r = 0.7 + rand() * 2.1;
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${rand() > 0.72 ? "#7fdec0" : "#ffd58f"}" opacity="${fmt(0.1 + rand() * 0.34)}"/>`;
  }).join("");

  const floor = Array.from({ length: 13 }, (_, i) => {
    const x = -300 + i * 180;
    return `<line x1="800" y1="470" x2="${x}" y2="1000" stroke="#f0a03a" stroke-opacity="0.05" stroke-width="1"/>`;
  }).join("");

  const body = `
  <ellipse cx="820" cy="430" rx="720" ry="400" fill="url(#warmCore)" opacity="0.34"/>
  <ellipse cx="470" cy="770" rx="420" ry="240" fill="url(#tealCore)" opacity="0.22"/>
  <polygon points="690,0 910,0 1290,1000 310,1000" fill="url(#beam)" filter="url(#blur48)"/>
  <g opacity="0.65">${floor}</g>
  <line x1="80" y1="492" x2="1520" y2="492" stroke="url(#teal)" stroke-width="1.5" opacity="0.35" filter="url(#blur3)"/>
  <line x1="80" y1="492" x2="1520" y2="492" stroke="#7fdec0" stroke-width="1" opacity="0.22"/>
  ${panelMarkup}
  ${dust}
  <ellipse cx="800" cy="900" rx="640" ry="90" fill="#000" opacity="0.45" filter="url(#blur48)"/>`;

  return svg(body, baseDefs("amber"));
}

/* ------------------------------------------------------------------ */
/* 02 â€” Liquidity: molten gold and teal ink folding through obsidian    */
/* ------------------------------------------------------------------ */
function sceneLiquidity() {
  const rand = mulberry32(41772);

  const ribbon = (pts, width, color, opacity, blur) => {
    const d = smoothPath(pts);
    return `<path d="${d}" stroke="url(#${color})" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${opacity}"${blur ? ` filter="url(#${blur})"` : ""}/>`;
  };

  const gold = [
    [-180, 790],
    [120, 640],
    [360, 720],
    [610, 470],
    [840, 545],
    [1080, 320],
    [1330, 410],
    [1780, 250],
  ];
  const gold2 = [
    [-160, 900],
    [190, 770],
    [430, 800],
    [700, 600],
    [950, 640],
    [1210, 450],
    [1450, 500],
    [1760, 380],
  ];
  const teal = [
    [-150, 320],
    [170, 430],
    [410, 270],
    [690, 400],
    [960, 250],
    [1240, 380],
    [1520, 300],
    [1770, 370],
  ];
  const filament = [
    [-140, 720],
    [160, 590],
    [400, 660],
    [650, 440],
    [880, 500],
    [1120, 300],
    [1360, 390],
    [1750, 240],
  ];

  const loops = Array.from({ length: 7 }, (_, i) => {
    const r = 150 + i * 44;
    const pts = [];
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const rr = r * (1 + 0.12 * Math.sin(3 * ang + i) + 0.06 * Math.cos(5 * ang - i));
      pts.push([850 + Math.cos(ang) * rr * 1.3, 500 + Math.sin(ang) * rr * 0.72]);
    }
    return `<path d="${smoothPath(pts, true)}" stroke="${i % 3 === 0 ? "url(#teal)" : "url(#amber)"}" stroke-width="${i % 3 === 0 ? 1 : 1.4}" stroke-opacity="${fmt(0.08 + i * 0.012)}" fill="none"/>`;
  }).join("");

  const bubbles = Array.from({ length: 54 }, () => {
    const x = 190 + rand() * 1220;
    const y = 120 + rand() * 760;
    const r = 1.1 + rand() * 4.8;
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${rand() > 0.78 ? "#7fdec0" : "#ffe2a8"}" opacity="${fmt(0.08 + rand() * 0.4)}"${r > 3.2 ? ' filter="url(#blur3)"' : ""}/>`;
  }).join("");

  const glints = Array.from({ length: 9 }, (_, i) => {
    const x = 220 + i * 145;
    const y = 300 + Math.sin(i * 1.7) * 220;
    return `<path d="M ${fmt(x)} ${fmt(y)} q 34 -46 78 -24" stroke="#fff1d2" stroke-width="${fmt(1.4 + rand() * 2.4)}" stroke-linecap="round" fill="none" opacity="${fmt(0.18 + rand() * 0.4)}" filter="url(#blur3)"/>`;
  }).join("");

  const body = `
  <ellipse cx="330" cy="230" rx="620" ry="430" fill="url(#warmCore)" opacity="0.55"/>
  <ellipse cx="1290" cy="720" rx="560" ry="420" fill="url(#tealCore)" opacity="0.36"/>
  <ellipse cx="880" cy="500" rx="470" ry="300" fill="url(#warmCore)" opacity="0.2"/>

  ${ribbon(teal, 130, "teal", 0.22, "blur48")}
  ${ribbon(teal, 62, "teal", 0.42, "blur20")}
  ${ribbon(teal, 18, "teal", 0.55, "blur8")}
  ${ribbon(teal, 4, "teal", 0.5, "")}

  ${ribbon(gold2, 150, "amber", 0.2, "blur48")}
  ${ribbon(gold2, 66, "amber", 0.42, "blur20")}
  ${ribbon(gold2, 14, "amber", 0.7, "blur8")}

  ${ribbon(gold, 180, "amber", 0.24, "blur48")}
  ${ribbon(gold, 96, "amber", 0.5, "blur20")}
  ${ribbon(gold, 34, "amber", 0.8, "blur8")}
  ${ribbon(gold, 10, "amber", 0.9, "")}

  <g opacity="0.9">${loops}</g>

  ${ribbon(filament, 4, "amber", 0.95, "blur3")}
  ${ribbon(filament, 1.4, "amber", 1, "")}

  ${glints}
  ${bubbles}

  <ellipse cx="840" cy="940" rx="760" ry="110" fill="#000" opacity="0.5" filter="url(#blur48)"/>
  <line x1="120" y1="690" x2="1500" y2="690" stroke="#7fdec0" stroke-width="1" opacity="0.12" filter="url(#blur3)"/>`;

  return svg(body, baseDefs("amber", 0.6));
}

/* ------------------------------------------------------------------ */
/* 03 â€” Signal: market topography, contour ridges and luminous nodes    */
/* ------------------------------------------------------------------ */
function sceneSignal() {
  const rand = mulberry32(60331);
  const cx = 900;
  const cy = 470;

  const contours = Array.from({ length: 27 }, (_, i) => {
    const radius = 46 + i * 34;
    const phase = i * 0.42 + 0.7;
    const d = organicLoop(cx, cy, radius, phase, 1.42, 0.74);
    const teal = i % 7 === 3;
    const strong = i % 5 === 0;
    const stroke = teal ? "url(#teal)" : "url(#amber)";
    const opacity = strong ? 0.3 : 0.08 + (i % 4) * 0.015;
    return `
      <path d="${d}" stroke="${stroke}" stroke-width="${strong ? 2 : 1.1}" stroke-opacity="${fmt(opacity)}" fill="none"${strong ? ' filter="url(#blur3)"' : ""}/>
      ${strong ? `<path d="${d}" stroke="${teal ? "#7fdec0" : "#ffd58f"}" stroke-width="0.9" stroke-opacity="0.22" fill="none"/>` : ""}`;
  }).join("");

  const nodes = [
    [430, 372],
    [592, 690],
    [860, 300],
    [1110, 620],
    [1280, 356],
    [980, 760],
  ];
  const nodeLines = nodes
    .slice(0, -1)
    .map((p, i) => {
      const q = nodes[i + 1];
      return `<path d="M ${p[0]} ${p[1]} Q ${fmt((p[0] + q[0]) / 2)} ${fmt((p[1] + q[1]) / 2 - 110)} ${q[0]} ${q[1]}" stroke="#f0a03a" stroke-width="1" stroke-opacity="0.16" stroke-dasharray="4 8"/>`;
    })
    .join("");
  const nodeMarkup = nodes
    .map(([x, y], i) => {
      const teal = i % 3 === 0;
      return `
      <circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${teal ? "#7fdec0" : "#ffd58f"}" stroke-opacity="0.24"/>
      <circle cx="${x}" cy="${y}" r="7" fill="${teal ? "#45a07a" : "#e2902b"}" fill-opacity="0.28" stroke="${teal ? "#7fdec0" : "#ffd58f"}" stroke-opacity="0.7" stroke-width="1.2"/>
      <circle cx="${x}" cy="${y}" r="2.2" fill="#ffe9c2"/>`;
    })
    .join("");

  const lattice = Array.from({ length: 20 }, (_, i) => {
    const x = 80 + i * 76;
    return `<line x1="${x}" y1="80" x2="${x}" y2="920" stroke="#f0a03a" stroke-opacity="0.022" stroke-width="1"/>`;
  }).join("");

  const dust = Array.from({ length: 58 }, () => {
    const x = 80 + rand() * 1440;
    const y = 60 + rand() * 880;
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(0.6 + rand() * 1.8)}" fill="${rand() > 0.8 ? "#7fdec0" : "#ffd58f"}" opacity="${fmt(0.08 + rand() * 0.3)}"/>`;
  }).join("");

  const body = `
  <ellipse cx="390" cy="230" rx="660" ry="470" fill="url(#warmCore)" opacity="0.4"/>
  <ellipse cx="1180" cy="800" rx="620" ry="380" fill="url(#tealCore)" opacity="0.3"/>
  <ellipse cx="900" cy="470" rx="470" ry="300" fill="url(#warmCore)" opacity="0.16"/>
  ${lattice}
  ${contours}
  ${nodeLines}
  ${nodeMarkup}
  ${dust}
  <line x1="60" y1="492" x2="1540" y2="492" stroke="url(#amber)" stroke-width="1" opacity="0.14"/>
  <ellipse cx="900" cy="950" rx="720" ry="100" fill="#000" opacity="0.45" filter="url(#blur48)"/>`;

  return svg(body, baseDefs("amber"));
}

/* ------------------------------------------------------------------ */
/* 04 â€” Protection: smoked-glass shield prism, teal core, telemetry     */
/* ------------------------------------------------------------------ */
function sceneShield() {
  const rand = mulberry32(91277);
  const cx = 800;
  const cy = 500;

  const shieldOuter = "M800 214 L1032 302 V492 C1032 652 918 754 800 806 C682 754 568 652 568 492 V302 Z";
  const shieldInner = "M800 282 L966 346 V490 C966 602 890 682 800 726 C710 682 634 602 634 490 V346 Z";

  const rings = [452, 382, 312, 242].map((r, i) => {
    const dash = i === 1 ? ' stroke-dasharray="10 14"' : i === 3 ? ' stroke-dasharray="2 9"' : "";
    return `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${i % 2 === 0 ? "#45a07a" : "#f0a03a"}" stroke-opacity="${fmt(0.1 + i * 0.035)}" stroke-width="${i === 0 ? 1 : 1.4}"${dash} fill="none"/>`;
  }).join("");

  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2;
    const inner = 366;
    const outer = i % 6 === 0 ? 384 : 374;
    return `<line x1="${fmt(cx + Math.cos(a) * inner)}" y1="${fmt(cy + Math.sin(a) * inner)}" x2="${fmt(cx + Math.cos(a) * outer)}" y2="${fmt(cy + Math.sin(a) * outer)}" stroke="#45a07a" stroke-opacity="${i % 6 === 0 ? "0.28" : "0.11"}" stroke-width="1"/>`;
  }).join("");

  const scanlines = Array.from({ length: 26 }, (_, i) => {
    const y = 250 + i * 20;
    return `<line x1="600" y1="${y}" x2="1000" y2="${y}" stroke="#7fdec0" stroke-opacity="0.045" stroke-width="1"/>`;
  }).join("");

  const orbit = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = cx + Math.cos(a) * 418;
    const y = cy + Math.sin(a) * 418 * 0.82;
    return `
    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="6" fill="${i % 2 ? "#f0a03a" : "#45a07a"}" fill-opacity="0.3" stroke="${i % 2 ? "#ffd58f" : "#7fdec0"}" stroke-opacity="0.7" stroke-width="1.2"/>
    <circle cx="${fmt(x)}" cy="${fmt(y)}" r="18" fill="none" stroke="${i % 2 ? "#ffd58f" : "#7fdec0"}" stroke-opacity="0.14"/>`;
  }).join("");

  const dust = Array.from({ length: 38 }, () => {
    const x = 180 + rand() * 1240;
    const y = 120 + rand() * 760;
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(0.6 + rand() * 2)}" fill="${rand() > 0.76 ? "#7fdec0" : "#ffd58f"}" opacity="${fmt(0.08 + rand() * 0.3)}"/>`;
  }).join("");

  const body = `
  <ellipse cx="800" cy="500" rx="700" ry="520" fill="url(#tealCore)" opacity="0.35"/>
  <ellipse cx="800" cy="430" rx="420" ry="380" fill="url(#warmCore)" opacity="0.2"/>
  <rect x="748" y="-40" width="104" height="1080" fill="url(#beam)" opacity="0.4" filter="url(#blur48)"/>
  ${rings}
  ${ticks}
  ${orbit}

  <g filter="url(#blur20)" opacity="0.5">
    <path d="${shieldOuter}" fill="none" stroke="#e2902b" stroke-width="10"/>
  </g>
  <path d="${shieldOuter}" fill="url(#glass)" fill-opacity="0.9" stroke="url(#edge)" stroke-width="2.4"/>
  <path d="${shieldOuter}" fill="none" stroke="#ffe2a8" stroke-opacity="0.32" stroke-width="1"/>
  <path d="${shieldInner}" fill="none" stroke="url(#teal)" stroke-opacity="0.42" stroke-width="1.5"/>
  <clipPath id="shieldClip"><path d="${shieldOuter}"/></clipPath>
  <g clip-path="url(#shieldClip)">
    ${scanlines}
    <rect x="600" y="250" width="120" height="520" fill="#ffd58f" opacity="0.05" filter="url(#blur20)"/>
    <rect x="900" y="280" width="90" height="500" fill="#7fdec0" opacity="0.045" filter="url(#blur20)"/>
    <path d="M640 360 L800 300 L960 360" stroke="#ffe2a8" stroke-opacity="0.22" stroke-width="1.4" fill="none"/>
  </g>

  <circle cx="800" cy="522" r="76" fill="#0b1210" fill-opacity="0.82" stroke="#45a07a" stroke-opacity="0.5" stroke-width="1.4"/>
  <circle cx="800" cy="522" r="54" fill="url(#tealCore)" fill-opacity="0.4" stroke="#7fdec0" stroke-opacity="0.6" stroke-width="1.2"/>
  <path d="M770 524 L791 545 L834 500" stroke="#ffe9c2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#blur3)"/>
  <path d="M770 524 L791 545 L834 500" stroke="#fff4dd" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>

  <circle cx="800" cy="806" r="5" fill="#ffd58f" opacity="0.9"/>
  <line x1="800" y1="812" x2="800" y2="900" stroke="url(#amber)" stroke-width="1" opacity="0.18"/>
  ${dust}
  <ellipse cx="800" cy="930" rx="620" ry="90" fill="#000" opacity="0.45" filter="url(#blur48)"/>`;

  return svg(body, baseDefs("teal"));
}

/* ------------------------------------------------------------------ */
/* 05 â€” Momentum: brass monoliths ascending through a teal horizon      */
/* ------------------------------------------------------------------ */
function sceneMomentum() {
  const rand = mulberry32(33091);
  const horizon = 646;
  const bars = Array.from({ length: 6 }, (_, i) => {
    const w = 86;
    const x = 214 + i * 206;
    const baseY = 780 - i * 16;
    const h = 118 + i * 58;
    const topY = baseY - h;
    const dx = -52;
    const dy = 30;
    return { i, x, w, baseY, h, topY, dx, dy };
  });

  const barMarkup = bars
    .map(({ i, x, w, baseY, h, topY, dx, dy }) => {
      const mirror = i % 2 === 0;
      return `
      <g opacity="${fmt(0.7 + i * 0.05)}">
        <rect x="${x}" y="${topY}" width="${w}" height="${h}" fill="url(#amberSoft)" opacity="${fmt(0.24 + i * 0.08)}" filter="url(#blur20)"/>
        <polygon points="${x},${topY} ${x + dx},${topY - dy} ${x + w + dx},${topY - dy} ${x + w},${topY}" fill="#6d3d0c" fill-opacity="0.85"/>
        <polygon points="${x + w},${topY} ${x + w + dx},${topY - dy} ${x + w + dx},${baseY - dy} ${x + w},${baseY}" fill="#3a220b" fill-opacity="0.9"/>
        <rect x="${x}" y="${topY}" width="${w}" height="${h}" fill="url(#glass)" stroke="#5f350a" stroke-opacity="0.6" stroke-width="1"/>
        <rect x="${x}" y="${topY}" width="${w}" height="${h}" fill="url(#amberSoft)" opacity="${fmt(0.12 + i * 0.04)}"/>
        <line x1="${x + 1}" y1="${topY + 2}" x2="${x + 1}" y2="${baseY - 2}" stroke="#ffe2a8" stroke-opacity="${fmt(0.25 + i * 0.07)}" stroke-width="1.6"/>
        <line x1="${x + w - 1}" y1="${topY + 2}" x2="${x + w - 1}" y2="${baseY - 2}" stroke="${mirror ? "#7fdec0" : "#e2902b"}" stroke-opacity="0.32" stroke-width="1"/>
        <rect x="${x}" y="${topY}" width="${w}" height="1.6" fill="#ffe2a8" opacity="0.55"/>
        <rect x="${x + 14}" y="${baseY - h * 0.34}" width="${w - 28}" height="2" rx="1" fill="#ffd58f" opacity="0.2"/>
        <rect x="${x + 14}" y="${baseY - h * 0.22}" width="${w - 46}" height="2" rx="1" fill="#7fdec0" opacity="0.24"/>
        <rect x="${x + 8}" y="${baseY}" width="${w + 8}" height="${h * 0.52}" fill="url(#amberSoft)" opacity="0.07"/>
      </g>`;
    })
    .join("");

  const tops = bars.map((b) => [b.x + b.w / 2 + b.dx / 2, b.topY - b.dy / 2]);
  const trend = smoothPath(tops);
  const nodes = tops
    .map(([x, y], i) => `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${i === tops.length - 1 ? 7 : 4}" fill="${i === tops.length - 1 ? "#ffe9c2" : "#ffd58f"}" opacity="0.9"/><circle cx="${fmt(x)}" cy="${fmt(y)}" r="${i === tops.length - 1 ? 18 : 11}" fill="none" stroke="#ffd58f" stroke-opacity="${i === tops.length - 1 ? "0.3" : "0.16"}"/>`)
    .join("");

  const floorLines = Array.from({ length: 16 }, (_, i) => {
    const x = -500 + i * 170;
    return `<line x1="800" y1="${horizon}" x2="${x}" y2="1000" stroke="#f0a03a" stroke-opacity="0.05" stroke-width="1"/>`;
  }).join("");
  const floorRows = Array.from({ length: 10 }, (_, i) => {
    const y = horizon + Math.pow(i / 9, 2.1) * 354;
    return `<line x1="0" y1="${fmt(y)}" x2="1600" y2="${fmt(y)}" stroke="#f0a03a" stroke-opacity="${fmt(0.03 + i * 0.008)}" stroke-width="1"/>`;
  }).join("");

  const dust = Array.from({ length: 52 }, () => {
    const x = 80 + rand() * 1440;
    const y = 100 + rand() * 780;
    return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(0.6 + rand() * 2)}" fill="${rand() > 0.74 ? "#7fdec0" : "#ffd58f"}" opacity="${fmt(0.08 + rand() * 0.32)}"/>`;
  }).join("");

  const body = `
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="880" cy="610" rx="780" ry="310" fill="url(#tealCore)" opacity="0.38"/>
  <ellipse cx="360" cy="290" rx="580" ry="390" fill="url(#warmCore)" opacity="0.4"/>
  <rect x="0" y="${horizon - 130}" width="${W}" height="260" fill="#0c1612" opacity="0.45" filter="url(#blur48)"/>
  <g opacity="0.8">${floorLines}${floorRows}</g>

  ${barMarkup}

  <path d="${trend}" stroke="url(#amber)" stroke-width="3" fill="none" opacity="0.65" filter="url(#blur3)"/>
  <path d="${trend}" stroke="#ffe2a8" stroke-width="1.3" fill="none" opacity="0.8"/>
  ${nodes}

  <ellipse cx="800" cy="700" rx="900" ry="150" fill="#7fdec0" opacity="0.05" filter="url(#blur48)"/>
  <line x1="60" y1="${horizon}" x2="1540" y2="${horizon}" stroke="url(#teal)" stroke-width="1.2" opacity="0.3"/>
  ${dust}
  <ellipse cx="800" cy="980" rx="800" ry="120" fill="#000" opacity="0.55" filter="url(#blur48)"/>`;

  return svg(body, baseDefs("teal", 0.85));
}

/* ------------------------------------------------------------------ */
mkdirSync(OUT, { recursive: true });
const scenes = {
  "showcase-ledger.svg": sceneLedger(),
  "showcase-liquidity.svg": sceneLiquidity(),
  "showcase-signal.svg": sceneSignal(),
  "showcase-shield.svg": sceneShield(),
  "showcase-momentum.svg": sceneMomentum(),
};
for (const [name, content] of Object.entries(scenes)) {
  writeFileSync(resolve(OUT, name), content, "utf8");
  console.log(`wrote ${name} (${(content.length / 1024).toFixed(1)} kB)`);
}
