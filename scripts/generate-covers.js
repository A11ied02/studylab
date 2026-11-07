import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coversDir = path.resolve(__dirname, '../public/covers');
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

// Function to generate clean, authentic NCERT book cover SVGs
const covers = [
  {
    name: 'science',
    title: 'SCIENCE',
    sub: 'Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#047857', '#065F46', '#064E3B'],
    accent: '#34D399',
    badge: 'CLASS X',
    motif: `
      <circle cx="200" cy="270" r="80" stroke="rgba(52, 211, 153, 0.4)" stroke-width="2" fill="none" stroke-dasharray="6 6"/>
      <circle cx="200" cy="270" r="50" stroke="rgba(52, 211, 153, 0.7)" stroke-width="2.5" fill="none"/>
      <ellipse cx="200" cy="270" rx="90" ry="35" stroke="#34D399" stroke-width="2" fill="none" transform="rotate(30 200 270)"/>
      <ellipse cx="200" cy="270" rx="90" ry="35" stroke="#34D399" stroke-width="2" fill="none" transform="rotate(-30 200 270)"/>
      <ellipse cx="200" cy="270" rx="90" ry="35" stroke="#34D399" stroke-width="2" fill="none" transform="rotate(90 200 270)"/>
      <circle cx="200" cy="270" r="14" fill="#34D399"/>
      <circle cx="200" cy="270" r="7" fill="#064E3B"/>
      <!-- Molecule / Flask node accents -->
      <path d="M160 410 L190 460 L190 510 L210 510 L210 460 L240 410 Z" fill="rgba(52, 211, 153, 0.25)" stroke="#34D399" stroke-width="2"/>
    `
  },
  {
    name: 'maths',
    title: 'MATHEMATICS',
    sub: 'Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#C2410C', '#9A3412', '#7C2D12'],
    accent: '#FB923C',
    badge: 'CLASS X',
    motif: `
      <!-- Geometric polyhedra / Mobius / Fibonacci spiral -->
      <polygon points="200,200 260,240 260,310 200,350 140,310 140,240" stroke="#FB923C" stroke-width="2.5" fill="rgba(251, 146, 60, 0.15)"/>
      <line x1="200" y1="200" x2="200" y2="350" stroke="#FB923C" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="140" y1="240" x2="260" y2="310" stroke="#FB923C" stroke-width="1.5" stroke-dasharray="4 4"/>
      <line x1="140" y1="310" x2="260" y2="240" stroke="#FB923C" stroke-width="1.5" stroke-dasharray="4 4"/>
      <!-- Isometric cube -->
      <polygon points="200,370 240,390 200,410 160,390" fill="rgba(251, 146, 60, 0.4)"/>
      <polygon points="160,390 200,410 200,450 160,430" fill="rgba(251, 146, 60, 0.25)"/>
      <polygon points="200,410 240,390 240,430 200,450" fill="rgba(251, 146, 60, 0.35)"/>
      <text x="200" y="490" text-anchor="middle" font-family="Ubuntu, sans-serif" font-size="16" fill="#FDBA74" font-weight="600" letter-spacing="2">f(x) = ax² + bx + c</text>
    `
  },
  {
    name: 'social-science',
    title: 'SOCIAL SCIENCE',
    sub: 'Democratic Life, History, Geography & Economics',
    code: 'NCERT • CLASS X',
    gradient: ['#831843', '#701A75', '#4C0519'],
    accent: '#F472B6',
    badge: 'CLASS X',
    motif: `
      <!-- Ashoka Emblem & Globe contour -->
      <circle cx="200" cy="270" r="70" stroke="#F472B6" stroke-width="2" fill="none"/>
      <ellipse cx="200" cy="270" rx="70" ry="25" stroke="rgba(244, 114, 182, 0.5)" stroke-width="1.5" fill="none"/>
      <ellipse cx="200" cy="270" rx="25" ry="70" stroke="rgba(244, 114, 182, 0.5)" stroke-width="1.5" fill="none"/>
      <line x1="200" y1="190" x2="200" y2="350" stroke="#F472B6" stroke-width="1.5"/>
      <line x1="120" y1="270" x2="280" y2="270" stroke="#F472B6" stroke-width="1.5"/>
      <circle cx="200" cy="420" r="30" stroke="#F472B6" stroke-width="2" fill="rgba(244, 114, 182, 0.1)"/>
      <!-- Compass needle -->
      <polygon points="200,395 208,420 200,415 192,420" fill="#F472B6"/>
      <polygon points="200,445 208,420 200,425 192,420" fill="rgba(244, 114, 182, 0.4)"/>
    `
  },
  {
    name: 'history',
    title: 'INDIA & CONTEMPORARY WORLD II',
    sub: 'History Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#78350F', '#602B0B', '#451A03'],
    accent: '#FBBF24',
    badge: 'HISTORY',
    motif: `
      <!-- Charkha / Historic wheel motif -->
      <circle cx="200" cy="280" r="65" stroke="#FBBF24" stroke-width="2.5" fill="none"/>
      <circle cx="200" cy="280" r="14" fill="#FBBF24"/>
      ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => 
        `<line x1="200" y1="280" x2="${200 + 65 * Math.cos(deg * Math.PI / 180)}" y2="${280 + 65 * Math.sin(deg * Math.PI / 180)}" stroke="rgba(251, 191, 36, 0.6)" stroke-width="1.5"/>`
      ).join('')}
      <path d="M140 430 Q200 400 260 430 L260 460 Q200 430 140 460 Z" fill="rgba(251, 191, 36, 0.25)" stroke="#FBBF24" stroke-width="1.5"/>
    `
  },
  {
    name: 'geography',
    title: 'CONTEMPORARY INDIA II',
    sub: 'Geography Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#0F766E', '#115E59', '#134E4A'],
    accent: '#2DD4BF',
    badge: 'GEOGRAPHY',
    motif: `
      <!-- Earth & Topography lines -->
      <circle cx="200" cy="280" r="75" stroke="#2DD4BF" stroke-width="2.5" fill="rgba(45, 212, 191, 0.1)"/>
      <path d="M130 270 Q160 250 190 280 T260 260" stroke="#2DD4BF" stroke-width="2" fill="none"/>
      <path d="M140 295 Q170 275 210 300 T270 285" stroke="#2DD4BF" stroke-width="1.5" fill="none"/>
      <path d="M150 320 Q180 300 220 325 T265 315" stroke="rgba(45, 212, 191, 0.6)" stroke-width="1.5" fill="none"/>
      <!-- Mountain ridges -->
      <polygon points="150,450 185,410 220,450" fill="rgba(45, 212, 191, 0.25)" stroke="#2DD4BF" stroke-width="1.5"/>
      <polygon points="195,450 230,395 265,450" fill="rgba(45, 212, 191, 0.4)" stroke="#2DD4BF" stroke-width="1.5"/>
    `
  },
  {
    name: 'civics',
    title: 'DEMOCRATIC POLITICS II',
    sub: 'Political Science Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#1E3A8A', '#1E40AF', '#172554'],
    accent: '#60A5FA',
    badge: 'CIVICS',
    motif: `
      <!-- Parliament columns & Ashoka chakra -->
      <rect x="140" y="240" width="120" height="12" rx="3" fill="#60A5FA"/>
      <rect x="145" y="320" width="110" height="10" rx="2" fill="#60A5FA"/>
      <rect x="150" y="255" width="8" height="62" fill="rgba(96, 165, 250, 0.7)"/>
      <rect x="175" y="255" width="8" height="62" fill="rgba(96, 165, 250, 0.7)"/>
      <rect x="200" y="255" width="8" height="62" fill="rgba(96, 165, 250, 0.7)"/>
      <rect x="225" y="255" width="8" height="62" fill="rgba(96, 165, 250, 0.7)"/>
      <polygon points="135,238 200,200 265,238" fill="rgba(96, 165, 250, 0.3)" stroke="#60A5FA" stroke-width="2"/>
      <circle cx="200" cy="410" r="32" stroke="#60A5FA" stroke-width="2" fill="rgba(96, 165, 250, 0.15)"/>
      <circle cx="200" cy="410" r="6" fill="#60A5FA"/>
    `
  },
  {
    name: 'economics',
    title: 'UNDERSTANDING ECONOMIC DEVELOPMENT',
    sub: 'Economics Textbook for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#B45309', '#92400E', '#78350F'],
    accent: '#FCD34D',
    badge: 'ECONOMICS',
    motif: `
      <!-- Economic trend & Rupee emblem -->
      <polyline points="140,320 170,290 205,305 240,250 265,230" stroke="#FCD34D" stroke-width="3" fill="none"/>
      <circle cx="265" cy="230" r="6" fill="#FCD34D"/>
      <!-- Rupee symbol in coin -->
      <circle cx="200" cy="410" r="36" stroke="#FCD34D" stroke-width="2" fill="rgba(252, 211, 77, 0.15)"/>
      <text x="200" y="422" text-anchor="middle" font-family="Ubuntu, sans-serif" font-size="34" font-weight="700" fill="#FCD34D">₹</text>
    `
  },
  {
    name: 'english',
    title: 'ENGLISH LANGUAGE & LITERATURE',
    sub: 'First Flight & Footprints Without Feet',
    code: 'NCERT • CLASS X',
    gradient: ['#312E81', '#1E1B4B', '#1E293B'],
    accent: '#818CF8',
    badge: 'CLASS X',
    motif: `
      <!-- Open book / quill motif -->
      <path d="M140 270 Q200 250 200 300 Q200 250 260 270 L260 340 Q200 320 200 370 Q200 320 140 340 Z" fill="rgba(129, 140, 248, 0.2)" stroke="#818CF8" stroke-width="2.5"/>
      <line x1="200" y1="300" x2="200" y2="370" stroke="#818CF8" stroke-width="2"/>
      <!-- Soaring bird silhouette -->
      <path d="M170 410 Q200 380 215 400 Q230 380 260 410 Q225 410 215 425 Q205 410 170 410 Z" fill="#818CF8"/>
    `
  },
  {
    name: 'first-flight',
    title: 'FIRST FLIGHT',
    sub: 'Main Literature Reader for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#1E3A8A', '#2563EB', '#1D4ED8'],
    accent: '#93C5FD',
    badge: 'READER',
    motif: `
      <!-- Soaring seagull across the sun -->
      <circle cx="200" cy="270" r="55" fill="rgba(255, 255, 255, 0.15)"/>
      <path d="M150 260 Q185 220 205 250 Q225 220 260 260 Q220 255 205 275 Q190 255 150 260 Z" fill="#93C5FD"/>
      <!-- Sun rays -->
      <line x1="200" y1="195" x2="200" y2="205" stroke="#93C5FD" stroke-width="2"/>
      <line x1="255" y1="215" x2="247" y2="223" stroke="#93C5FD" stroke-width="2"/>
      <line x1="145" y1="215" x2="153" y2="223" stroke="#93C5FD" stroke-width="2"/>
    `
  },
  {
    name: 'footprints-without-feet',
    title: 'FOOTPRINTS WITHOUT FEET',
    sub: 'Supplementary Reader for Class X',
    code: 'NCERT • CLASS X',
    gradient: ['#881337', '#9F1239', '#4C0519'],
    accent: '#FDA4AF',
    badge: 'SUPPLEMENTARY',
    motif: `
      <!-- Footstep footprints trail -->
      <ellipse cx="170" cy="250" rx="14" ry="24" fill="rgba(253, 164, 175, 0.7)" transform="rotate(-15 170 250)"/>
      <circle cx="163" cy="220" r="4" fill="#FDA4AF"/>
      <circle cx="170" cy="218" r="4.5" fill="#FDA4AF"/>
      <circle cx="178" cy="221" r="4" fill="#FDA4AF"/>

      <ellipse cx="230" cy="310" rx="14" ry="24" fill="rgba(253, 164, 175, 0.7)" transform="rotate(15 230 310)"/>
      <circle cx="237" cy="280" r="4" fill="#FDA4AF"/>
      <circle cx="230" cy="278" r="4.5" fill="#FDA4AF"/>
      <circle cx="222" cy="281" r="4" fill="#FDA4AF"/>
    `
  },
  {
    name: 'hindi',
    title: 'हिंदी (HINDI)',
    sub: 'स्पर्श एवं संचयन भाग २',
    code: 'NCERT • CLASS X',
    gradient: ['#581C87', '#6B21A8', '#3B0764'],
    accent: '#D8B4FE',
    badge: 'कक्षा १०',
    motif: `
      <!-- Devanagari calligraphy art -->
      <text x="200" y="290" text-anchor="middle" font-family="Ubuntu, sans-serif" font-size="72" font-weight="700" fill="#D8B4FE">अ</text>
      <circle cx="200" cy="270" r="70" stroke="rgba(216, 180, 254, 0.3)" stroke-width="2" stroke-dasharray="6 6"/>
      <path d="M140 400 Q200 380 260 400" stroke="#D8B4FE" stroke-width="2" fill="none"/>
      <text x="200" y="440" text-anchor="middle" font-family="Ubuntu, sans-serif" font-size="18" font-weight="600" fill="#E9D5FF">साहित्य एवं भाषा</text>
    `
  },
  {
    name: 'sparsh',
    title: 'स्पर्श (भाग २)',
    sub: 'द्वितीय भाषा हिंदी पाठ्यपुस्तक',
    code: 'NCERT • CLASS X',
    gradient: ['#3730A3', '#4338CA', '#312E81'],
    accent: '#A5B4FC',
    badge: 'कोर्स बी',
    motif: `
      <!-- Feather & Devanagari calligraphic swirl -->
      <path d="M220 220 Q230 280 180 340 Q170 300 200 250 Z" fill="rgba(165, 180, 252, 0.4)" stroke="#A5B4FC" stroke-width="2"/>
      <line x1="220" y1="220" x2="175" y2="350" stroke="#A5B4FC" stroke-width="2"/>
      <circle cx="200" cy="410" r="28" stroke="#A5B4FC" stroke-width="1.5" fill="none"/>
      <text x="200" y="418" text-anchor="middle" font-family="Ubuntu, sans-serif" font-size="20" font-weight="700" fill="#A5B4FC">काव्य</text>
    `
  },
  {
    name: 'sanchayan',
    title: 'संचयन (भाग २)',
    sub: 'पूरक पाठ्यपुस्तक कक्षा १०',
    code: 'NCERT • CLASS X',
    gradient: ['#854D0E', '#A16207', '#713F12'],
    accent: '#FDE047',
    badge: 'पूरक पुस्तक',
    motif: `
      <!-- Traditional manuscript scroll -->
      <rect x="150" y="240" width="100" height="90" rx="8" fill="rgba(253, 224, 71, 0.15)" stroke="#FDE047" stroke-width="2"/>
      <line x1="165" y1="265" x2="235" y2="265" stroke="#FDE047" stroke-width="1.5"/>
      <line x1="165" y1="285" x2="235" y2="285" stroke="#FDE047" stroke-width="1.5"/>
      <line x1="165" y1="305" x2="210" y2="305" stroke="#FDE047" stroke-width="1.5"/>
    `
  },
  {
    name: 'it',
    title: 'INFORMATION TECHNOLOGY',
    sub: 'Subject Code 402 • Skill Education',
    code: 'CBSE • CLASS X',
    gradient: ['#E95420', '#C34113', '#77216F'],
    accent: '#FDBA74',
    badge: 'CODE 402',
    motif: `
      <!-- Tech circuit & CPU chip motif -->
      <rect x="160" y="230" width="80" height="80" rx="10" fill="rgba(253, 186, 116, 0.2)" stroke="#FDBA74" stroke-width="2"/>
      <rect x="180" y="250" width="40" height="40" rx="4" fill="#FDBA74"/>
      <!-- Circuit pins -->
      <line x1="180" y1="215" x2="180" y2="230" stroke="#FDBA74" stroke-width="2"/>
      <line x1="200" y1="215" x2="200" y2="230" stroke="#FDBA74" stroke-width="2"/>
      <line x1="220" y1="215" x2="220" y2="230" stroke="#FDBA74" stroke-width="2"/>
      <line x1="180" y1="310" x2="180" y2="325" stroke="#FDBA74" stroke-width="2"/>
      <line x1="200" y1="310" x2="200" y2="325" stroke="#FDBA74" stroke-width="2"/>
      <line x1="220" y1="310" x2="220" y2="325" stroke="#FDBA74" stroke-width="2"/>
      <line x1="145" y1="250" x2="160" y2="250" stroke="#FDBA74" stroke-width="2"/>
      <line x1="145" y1="270" x2="160" y2="270" stroke="#FDBA74" stroke-width="2"/>
      <line x1="145" y1="290" x2="160" y2="290" stroke="#FDBA74" stroke-width="2"/>
      <line x1="240" y1="250" x2="255" y2="250" stroke="#FDBA74" stroke-width="2"/>
      <line x1="240" y1="270" x2="255" y2="270" stroke="#FDBA74" stroke-width="2"/>
      <line x1="240" y1="290" x2="255" y2="290" stroke="#FDBA74" stroke-width="2"/>
      <text x="200" y="400" text-anchor="middle" font-family="Ubuntu, monospace" font-size="14" fill="#FDBA74" font-weight="600">01001001 01010100</text>
    `
  }
];

for (const c of covers) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 580" width="100%" height="100%">
  <defs>
    <linearGradient id="grad_${c.name}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.gradient[0]}" />
      <stop offset="60%" stop-color="${c.gradient[1]}" />
      <stop offset="100%" stop-color="${c.gradient[2]}" />
    </linearGradient>
    <pattern id="grid_${c.name}" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="0.8"/>
    </pattern>
  </defs>
  <!-- Background with subtle textured grid -->
  <rect width="400" height="580" rx="14" fill="url(#grad_${c.name})"/>
  <rect width="400" height="580" rx="14" fill="url(#grid_${c.name})"/>

  <!-- Top bar header -->
  <rect x="25" y="24" width="350" height="34" rx="6" fill="rgba(0, 0, 0, 0.25)" stroke="rgba(255, 255, 255, 0.08)"/>
  <text x="40" y="46" font-family="Ubuntu, -apple-system, sans-serif" font-size="11" font-weight="700" fill="${c.accent}" letter-spacing="1.5">${c.code}</text>
  <rect x="305" y="30" width="60" height="22" rx="4" fill="${c.accent}"/>
  <text x="335" y="45" font-family="Ubuntu, -apple-system, sans-serif" font-size="10" font-weight="800" fill="#1C1C1E" text-anchor="middle">${c.badge}</text>

  <!-- Central Artwork Motif -->
  <g>
    ${c.motif}
  </g>

  <!-- Bottom Title Card with Ubuntu styling -->
  <rect x="24" y="470" width="352" height="86" rx="10" fill="rgba(18, 18, 20, 0.85)" stroke="rgba(255, 255, 255, 0.1)"/>
  <text x="40" y="504" font-family="Ubuntu, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF" letter-spacing="0.5">${c.title}</text>
  <text x="40" y="528" font-family="Ubuntu, -apple-system, sans-serif" font-size="12" font-weight="500" fill="rgba(255, 255, 255, 0.7)">${c.sub}</text>
  <line x1="40" y1="540" x2="140" y2="540" stroke="${c.accent}" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

  fs.writeFileSync(path.join(coversDir, `${c.name}.svg`), svg, 'utf-8');
}

console.log(`Generated ${covers.length} high-fidelity SVG textbook covers.`);
