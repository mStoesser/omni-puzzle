import { svg } from "lit-html";
import type { SVGTemplateResult } from "lit-html";
import type { BuiltinImage } from "../rooms/logic.ts";

// The pictures that come with the app for escape rooms (M44): simple flat illustrations in 16:9 (1600 × 900), drawn
// here so they need no files and no license. Placeholders, to be replaced by better pictures later; the tap areas of
// the example room ("study", "hall") sit on the things drawn here.

export const ROOM_VIEWBOX = "0 0 1600 900";

function study(): SVGTemplateResult {
  return svg`
    <rect width="1600" height="900" fill="#3f4d5c" />
    <rect y="560" width="1600" height="90" fill="#36414d" />
    <rect y="648" width="1600" height="252" fill="#6b4a32" />
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => svg`<rect x=${i * 200} y="648" width="198" height="252" fill=${i % 2 ? "#704e35" : "#664530"} />`)}
    <ellipse cx="800" cy="800" rx="420" ry="60" fill="#7d2f2f" opacity="0.8" />
    <rect x="780" y="0" width="6" height="70" fill="#222" /><ellipse cx="783" cy="80" rx="60" ry="18" fill="#e8d9a8" />
    <!-- painting -->
    <rect x="720" y="135" width="288" height="225" fill="#c9a24a" />
    <rect x="740" y="155" width="248" height="185" fill="#1d2a4a" />
    <polygon points="864,180 960,215 960,240" fill="#f5e27a" opacity="0.7" />
    <rect x="852" y="200" width="24" height="110" fill="#f2f2f2" /><rect x="852" y="230" width="24" height="14" fill="#c0392b" /><rect x="852" y="270" width="24" height="14" fill="#c0392b" />
    <rect x="740" y="300" width="248" height="40" fill="#24486b" />
    <!-- bookshelf -->
    <rect x="1040" y="180" width="60" height="380" fill="#5a3b26" />
    <!-- desk with lamp and the game of lights -->
    <rect x="110" y="500" width="520" height="30" rx="4" fill="#8a5c36" />
    <rect x="130" y="530" width="480" height="150" fill="#74492b" />
    <rect x="150" y="550" width="200" height="50" rx="4" fill="#82552f" /><rect x="150" y="615" width="200" height="50" rx="4" fill="#82552f" />
    <circle cx="250" cy="575" r="6" fill="#d9b25a" /><circle cx="250" cy="640" r="6" fill="#d9b25a" />
    <rect x="130" y="680" width="24" height="40" fill="#5a3820" /><rect x="586" y="680" width="24" height="40" fill="#5a3820" />
    <rect x="170" y="490" width="60" height="10" fill="#333" /><rect x="195" y="400" width="10" height="90" fill="#333" /><polygon points="160,410 240,410 220,370 180,370" fill="#e0b050" />
    <rect x="390" y="440" width="120" height="60" rx="6" fill="#222" />
    ${[0, 1, 2, 3, 4].map((i) => [0, 1].map((j) => svg`<rect x=${398 + i * 22} y=${448 + j * 24} width="16" height="18" rx="3" fill=${(i + j) % 2 ? "#f5d76e" : "#555"} />`))}
    <!-- safe -->
    <rect x="1100" y="612" width="230" height="36" fill="#4a3424" />
    <rect x="1120" y="450" width="192" height="162" rx="8" fill="#6c7680" />
    <rect x="1135" y="465" width="162" height="132" rx="6" fill="#5a636c" />
    <circle cx="1216" cy="531" r="30" fill="#3d444b" /><circle cx="1216" cy="531" r="6" fill="#c9ced3" />
    <rect x="1262" y="520" width="20" height="22" rx="4" fill="#c9ced3" />
    <!-- door -->
    <rect x="1366" y="170" width="212" height="550" fill="#2b2420" />
    <rect x="1376" y="180" width="192" height="540" fill="#8b5a2b" />
    <rect x="1396" y="205" width="152" height="220" rx="4" fill="#7a4e25" /><rect x="1396" y="455" width="152" height="240" rx="4" fill="#7a4e25" />
    <circle cx="1400" cy="450" r="10" fill="#d9b25a" />
  `;
}

function hall(): SVGTemplateResult {
  return svg`
    <rect width="1600" height="900" fill="#6a5d4f" />
    <rect y="0" width="1600" height="40" fill="#5c5044" />
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) =>
      [0, 1, 2].map((j) => svg`<rect x=${i * 100} y=${620 + j * 94} width="100" height="94" fill=${(i + j) % 2 ? "#d8d2c4" : "#3d3a36"} />`),
    )}
    <!-- doorway back to the study -->
    <rect x="0" y="260" width="170" height="460" fill="#2b2420" />
    <rect x="0" y="270" width="150" height="450" fill="#1b1714" />
    <polygon points="40,495 100,455 100,535" fill="#6a5d4f" opacity="0.6" />
    <!-- coat rack and pictures -->
    <rect x="330" y="250" width="12" height="400" fill="#4a3424" /><circle cx="336" cy="250" r="16" fill="#4a3424" />
    <path d="M300 300 q36 -40 72 0 v160 h-72 z" fill="#3e6b8a" />
    <rect x="470" y="200" width="160" height="120" fill="#c9a24a" /><rect x="482" y="212" width="136" height="96" fill="#8fb98b" /><circle cx="560" cy="250" r="20" fill="#f5d76e" />
    <rect x="1000" y="220" width="120" height="160" fill="#c9a24a" /><rect x="1012" y="232" width="96" height="136" fill="#a7c4d9" />
    <!-- crate with a parking puzzle on the lid -->
    <rect x="560" y="560" width="400" height="205" fill="#9c6b3c" />
    ${[0, 1, 2, 3].map((i) => svg`<rect x="560" y=${560 + i * 51} width="400" height="4" fill="#7a5230" />`)}
    <rect x="560" y="540" width="400" height="28" fill="#b07a45" />
    <rect x="560" y="560" width="24" height="205" fill="#7a5230" /><rect x="936" y="560" width="24" height="205" fill="#7a5230" />
    <rect x="700" y="600" width="120" height="90" rx="6" fill="#efe7d3" />
    <rect x="712" y="636" width="48" height="18" rx="4" fill="#c0392b" /><rect x="772" y="612" width="18" height="48" rx="4" fill="#2e86c1" /><rect x="732" y="664" width="48" height="16" rx="4" fill="#27ae60" />
    <!-- front door -->
    <rect x="1185" y="120" width="270" height="645" fill="#2b2420" />
    <rect x="1200" y="135" width="240" height="630" fill="#245a46" />
    <path d="M1240 280 v-60 a80 80 0 0 1 160 0 v60 z" fill="#bfe0f0" />
    <rect x="1235" y="320" width="170" height="160" rx="6" fill="#1e4d3c" /><rect x="1235" y="510" width="170" height="220" rx="6" fill="#1e4d3c" />
    <circle cx="1225" cy="500" r="12" fill="#d9b25a" /><rect x="1395" y="470" width="30" height="14" rx="4" fill="#d9b25a" />
    <rect x="1190" y="770" width="260" height="30" rx="6" fill="#7d6a4a" />
    <rect x="1490" y="300" width="40" height="70" rx="10" fill="#f5e27a" /><rect x="1500" y="370" width="20" height="20" fill="#333" />
  `;
}

function cellar(): SVGTemplateResult {
  return svg`
    <rect width="1600" height="900" fill="#3a3632" />
    ${Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: 14 }, (_, col) => svg`<rect x=${col * 120 - (row % 2) * 60} y=${row * 56} width="114" height="50" rx="4" fill=${(row + col) % 3 ? "#4a4440" : "#544c46"} />`),
    )}
    <rect y="700" width="1600" height="200" fill="#2a2724" />
    <rect x="796" y="0" width="8" height="140" fill="#222" /><circle cx="800" cy="160" r="26" fill="#f7e9a0" /><circle cx="800" cy="160" r="70" fill="#f7e9a0" opacity="0.12" />
    <!-- stairs -->
    ${[0, 1, 2, 3, 4, 5].map((i) => svg`<rect x=${40 + i * 50} y=${400 + i * 50} width=${300 - i * 50} height="50" fill=${i % 2 ? "#5b4a3a" : "#665342"} />`)}
    <!-- shelf with jars -->
    <rect x="560" y="260" width="440" height="20" fill="#5a3b26" /><rect x="560" y="420" width="440" height="20" fill="#5a3b26" /><rect x="560" y="580" width="440" height="20" fill="#5a3b26" />
    <rect x="560" y="260" width="20" height="440" fill="#4a3020" /><rect x="980" y="260" width="20" height="440" fill="#4a3020" />
    ${[0, 1, 2, 3, 4].map((i) => svg`<rect x=${600 + i * 76} y="190" width="52" height="70" rx="10" fill=${["#c0392b", "#d68910", "#27ae60", "#8e44ad", "#2e86c1"][i]} opacity="0.75" />`)}
    ${[0, 1, 2].map((i) => svg`<rect x=${610 + i * 120} y="350" width="80" height="70" rx="6" fill="#8c7b6b" />`)}
    <!-- barrel and chest -->
    <ellipse cx="1250" cy="560" rx="110" ry="30" fill="#6b4a32" /><rect x="1140" y="560" width="220" height="200" fill="#7a5532" /><ellipse cx="1250" cy="760" rx="110" ry="30" fill="#6b4a32" />
    <rect x="1140" y="600" width="220" height="12" fill="#3d3a36" /><rect x="1140" y="710" width="220" height="12" fill="#3d3a36" />
    <rect x="1400" y="640" width="160" height="110" rx="8" fill="#5a3b26" /><rect x="1470" y="680" width="20" height="26" rx="4" fill="#d9b25a" />
  `;
}

function lab(): SVGTemplateResult {
  return svg`
    <rect width="1600" height="900" fill="#d9e2e6" />
    ${Array.from({ length: 10 }, (_, row) =>
      Array.from({ length: 20 }, (_, col) => svg`<rect x=${col * 80 + 2} y=${row * 60 + 2} width="76" height="56" fill="#e6edf0" />`),
    )}
    <rect y="600" width="1600" height="300" fill="#8a9aa3" />
    <!-- screen -->
    <rect x="160" y="140" width="420" height="260" rx="10" fill="#1d2a33" />
    <polyline points="190,300 250,300 280,220 320,360 360,260 400,300 550,300" fill="none" stroke="#3ce07a" stroke-width="6" />
    <rect x="350" y="400" width="40" height="60" fill="#556" />
    <!-- bench with flasks -->
    <rect x="100" y="520" width="900" height="30" fill="#f2f2f2" /><rect x="120" y="550" width="860" height="180" fill="#b8c4ca" />
    <path d="M640 520 l30 -80 v-60 h20 v60 l30 80 z" fill="#7fd3e8" opacity="0.8" />
    <path d="M780 520 a45 45 0 1 1 0.1 0 z" transform="translate(0 -45)" fill="#e87fb4" opacity="0.8" />
    <rect x="860" y="430" width="24" height="90" rx="10" fill="#f5d76e" opacity="0.8" /><rect x="900" y="450" width="24" height="70" rx="10" fill="#9be87f" opacity="0.8" />
    <!-- cabinet with a keypad -->
    <rect x="1140" y="160" width="300" height="560" rx="8" fill="#9aa8b0" />
    <rect x="1160" y="180" width="125" height="520" rx="6" fill="#b4c0c6" /><rect x="1295" y="180" width="125" height="520" rx="6" fill="#b4c0c6" />
    <rect x="1305" y="380" width="70" height="90" rx="6" fill="#333" />
    ${[0, 1, 2].map((i) => [0, 1, 2].map((j) => svg`<rect x=${1313 + i * 20} y=${390 + j * 25} width="14" height="18" rx="3" fill="#ccc" />`))}
    <rect x="1490" y="420" width="70" height="70" rx="35" fill="#c0392b" />
  `;
}

const PICTURES: Record<BuiltinImage, () => SVGTemplateResult> = { study, hall, cellar, lab };

/** The drawing of a built-in picture, to put into an `<svg viewBox=ROOM_VIEWBOX>`. */
export function builtinPicture(id: BuiltinImage): SVGTemplateResult {
  return PICTURES[id]();
}

/** A cover from the server (M46): the drawing if it names a built-in picture, otherwise null. */
export function coverPicture(name: string): SVGTemplateResult | null {
  return Object.hasOwn(PICTURES, name) ? PICTURES[name as BuiltinImage]() : null;
}
