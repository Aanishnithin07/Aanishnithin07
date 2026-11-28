// Text measurement for SVG layout without a browser.
//   import { textWidth, truncate, metricsFor } from './measure.mjs';
//   textWidth('Aanish Nithin A', 'InstrumentSerif-Italic.woff2', 72)        -> width in px
//   textWidth('SELECTED WORK', 'GeistMono-400.woff2', 11, { letterSpacingEm: 0.1 })
//   truncate('a long description…', 'GeistMono-400.woff2', 13, 420)        -> string that fits 420px, with an ellipsis
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();
export function metricsFor(fontFile, dir = path.join(here, 'metrics')) {
  const key = path.join(dir, fontFile.replace(/\.woff2$/, '') + '.json');
  if (!cache.has(key)) cache.set(key, JSON.parse(fs.readFileSync(key, 'utf8')));
  return cache.get(key);
}
export function textWidth(text, fontFile, fontSize, { letterSpacingEm = 0, kern = true, dir } = {}) {
  const m = metricsFor(fontFile, dir); const s = fontSize / m.unitsPerEm; let w = 0;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]; const adv = m.advances[c] ?? m.advances['?'] ?? m.unitsPerEm * 0.5; w += adv * s;
    if (kern && i + 1 < chars.length) w += (m.kerning[c + chars[i + 1]] ?? 0) * s;
    if (i + 1 < chars.length) w += letterSpacingEm * fontSize;
  }
  return w;
}
export function truncate(text, fontFile, fontSize, maxWidth, opts = {}) {
  if (textWidth(text, fontFile, fontSize, opts) <= maxWidth) return text;
  const ell = '…'; let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (textWidth(text.slice(0, mid).trimEnd() + ell, fontFile, fontSize, opts) <= maxWidth) lo = mid; else hi = mid - 1; }
  return text.slice(0, lo).trimEnd() + ell;
}
export function wrap(text, fontFile, fontSize, maxWidth, opts = {}) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (textWidth(t, fontFile, fontSize, opts) <= maxWidth || !line) line = t; else { lines.push(line); line = w; } }
  if (line) lines.push(line); return lines;
}
