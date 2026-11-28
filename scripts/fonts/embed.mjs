// Helper: build an @font-face CSS block with a base64 data: URI for embedding a woff2 in an SVG <style>.
// Usage (in node):  import { fontFace } from './kit/fonts/embed.mjs';  const css = fontFace('Instrument Serif', 'InstrumentSerif-Italic.woff2', { style: 'italic' });
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function fontFace(family, file, { weight = 400, style = 'normal', dir = path.join(here, 'woff2') } = {}) {
  const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}
export function listFonts(dir = path.join(here, 'woff2')) { return fs.readdirSync(dir).filter(f => f.endsWith('.woff2')); }
