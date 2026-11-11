import { html } from "lit-html";
import { encodeQr, QR_QUIET_ZONE, qrBytes, qrPath } from "../../core/qr.ts";

// Encoding a long link takes a few milliseconds; the sheet re-renders on every change, so the last code is kept.
let last: { text: string; path: string; size: number } | null = null;

/**
 * The QR code of `text` as SVG: black on white whatever the app theme (scanners need the contrast and a light quiet
 * zone), level L at least (a screen does not get dirty), raised where the version allows. Null if it does not fit.
 */
export function qrCode(text: string, label: string) {
  if (last?.text !== text) {
    const code = encodeQr(qrBytes(text), { minLevel: "L" });
    if (!code) return null;
    last = { text, path: qrPath(code), size: code.size };
  }
  const { path, size } = last;
  const outer = size + QR_QUIET_ZONE * 2;
  const box = `${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${outer} ${outer}`;
  return html`<svg class="qr-code" viewBox=${box} role="img" aria-label=${label}
    shape-rendering="crispEdges">
    <rect x=${-QR_QUIET_ZONE} y=${-QR_QUIET_ZONE} width=${outer} height=${outer} fill="#fff" />
    <path d=${path} fill="#000" />
  </svg>`;
}
