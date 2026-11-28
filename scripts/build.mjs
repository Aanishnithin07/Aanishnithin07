#!/usr/bin/env node
// Draws the SVGs for the profile README from a public-activity snapshot.
//
//   node scripts/build.mjs data/profile.json assets
//
// Node >= 20, standard library only. Deterministic: nothing here reads the clock or rolls dice,
// so the same snapshot always produces the same bytes. Fonts (Newsreader and DM Mono, both under
// the SIL Open Font License) are embedded in every SVG as base64 so the graphics look the same
// everywhere GitHub shows them.
//
//   masthead-{light,dark}.svg   the nameplate: folio line, name, deck, degrees, language spectrum
//   clock-{light,dark}.svg      Fig. 1 — a 24-hour dial of when the commits happen (IST)
//   year-{light,dark}.svg       Fig. 2 — the last 365 days of contributions as one continuous trace
//   rule-*-{light,dark}.svg     section rules with a small-caps label
//   foot-{light,dark}.svg       the colophon

import fs from 'node:fs';
import path from 'node:path';
import { fontFace } from './fonts/embed.mjs';
import { textWidth, truncate, wrap } from './fonts/measure.mjs';

const [dataPath, outDir] = process.argv.slice(2);
if (!dataPath || !outDir) { console.error('usage: node scripts/build.mjs <data.json> <out-dir>'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ type system and palette
const W = 832; // GitHub's README content width on the profile page
const FILE = { serif: 'Newsreader-400.woff2', italic: 'Newsreader-Italic-400.woff2', mono: 'DMMono-Regular.woff2' };
const FACE = {
  serif: fontFace('Newsreader', FILE.serif, { weight: 400 }),
  italic: fontFace('Newsreader', FILE.italic, { weight: 400, style: 'italic' }),
  mono: fontFace('DM Mono', FILE.mono, { weight: 400 }),
};
const fontCss = (faces) => faces.map((f) => FACE[f]).join('') +
  `.serif{font-family:'Newsreader',Georgia,'Times New Roman',serif}` +
  `.it{font-family:'Newsreader',Georgia,'Times New Roman',serif;font-style:italic}` +
  `.mono{font-family:'DM Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`;
const THEME = {
  light: { ink: '#1f2328', dim: '#59636e', rule: '#d1d9e0', accent: '#bf3a1a', wash: 0.06 },
  dark: { ink: '#f0f6fc', dim: '#9198a1', rule: '#3d444d', accent: '#ff7b5c', wash: 0.09 },
};
const TRACK = 0.09; // em; uppercase mono labels only

// ------------------------------------------------------------------ small helpers
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n) => Math.round(n * 100) / 100;
const hh = (h) => String(((h % 24) + 24) % 24).padStart(2, '0');
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const sum = (a) => a.reduce((x, y) => x + y, 0);
const argmax = (a) => a.indexOf(Math.max(...a));
const argmin = (a) => a.indexOf(Math.min(...a));
const upper = (s) => s.toUpperCase();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dateUTC = (iso) => new Date(iso.slice(0, 10) + 'T00:00:00Z');
const longDate = (iso) => { const d = dateUTC(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dayMonth = (iso) => { const d = dateUTC(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const weekdayName = (iso) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateUTC(iso).getUTCDay()];
const fileOf = ({ font = 'serif', italic = false }) => (font === 'mono' ? FILE.mono : italic ? FILE.italic : FILE.serif);
const measure = (s, { font = 'serif', size = 15, track = 0, italic = false } = {}) => textWidth(s, fileOf({ font, italic }), size, { letterSpacingEm: track });

// A document under construction: a list of SVG fragments plus helpers that draw into it.
function doc(T) {
  const parts = [];
  const rule = (y, { color = T.rule, h = 1, x0 = 0, x1 = W } = {}) =>
    parts.push(`<rect x="${r2(x0)}" y="${r2(y)}" width="${r2(x1 - x0)}" height="${h}" fill="${color}" shape-rendering="crispEdges"/>`);
  const vrule = (x, y0, y1, color = T.rule) =>
    parts.push(`<rect x="${r2(x)}" y="${r2(y0)}" width="1" height="${r2(y1 - y0)}" fill="${color}" shape-rendering="crispEdges"/>`);
  // Text is start-anchored at a measured x, so end/middle alignment ignores trailing letter-spacing.
  const text = (x, y, s, { font = 'serif', size = 15, fill = T.ink, align = 'start', track = 0, italic = false, cls } = {}) => {
    const w = measure(s, { font, size, track, italic });
    const xx = align === 'end' ? x - w : align === 'middle' ? x - w / 2 : x;
    const c = cls || (font === 'mono' ? 'mono' : italic ? 'it' : 'serif');
    const attrs = [`class="${c}"`, `x="${r2(xx)}"`, `y="${r2(y)}"`, `font-size="${size}"`, `fill="${fill}"`];
    if (track) attrs.push(`letter-spacing="${r2(track * size)}"`);
    parts.push(`<text ${attrs.join(' ')}>${esc(s)}</text>`);
    return w;
  };
  const raw = (s) => parts.push(s);
  return { parts, rule, vrule, text, raw };
}
function svg(height, label, body, { css = '', faces = ['serif', 'italic', 'mono'] } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}">` +
    `<style>${fontCss(faces)}${css}</style><g text-rendering="optimizeLegibility">${body}</g></svg>`;
}
// Wrap, then tighten the measure until the last line stops being an orphan.
function balancedWrap(s, opts, maxWidth) {
  const file = fileOf(opts), size = opts.size;
  const lines = wrap(s, file, size, maxWidth);
  if (lines.length < 2) return lines;
  let lo = Math.ceil(maxWidth * 0.55), hi = Math.ceil(maxWidth);
  while (lo < hi) { const mid = (lo + hi) >> 1; if (wrap(s, file, size, mid).length === lines.length) hi = mid; else lo = mid + 1; }
  return wrap(s, file, size, hi);
}

// ------------------------------------------------------------------ facts derived from the snapshot
const P = data.profile, C = data.contributions;
const DECK = 'Code & cognition — software for the people side of work, by a computer-science student who also studies psychology.';

const genISO = /^\d{4}-\d{2}-\d{2}/.test(data.generatedAt) ? data.generatedAt.slice(0, 10) : C.windowEnd;
const gen = dateUTC(genISO), created = dateUTC(P.createdAt);
const issueNo = Math.floor((gen - created) / (7 * 86400000)) + 1; // one issue per week on GitHub
function isoWeek(d) {
  const t = new Date(d.getTime()); const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((t - y0) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
}
const wk = isoWeek(gen);
const utcOffset = (P.timezone.match(/\(([^)]+)\)/) || [])[1] || P.timezone;

const days = C.days.slice(-365);
const counts = days.map((d) => d.count);
const activeDays = counts.filter((c) => c > 0).length;
const peakIdx = argmax(counts), peak = counts[peakIdx];

const byHour = data.commitRhythm.byHour, byWeekday = data.commitRhythm.byWeekdayMonFirst;
const hourTotal = sum(byHour);
const peakHour = argmax(byHour);
const SWEEP = 1.25, peakDeg = (peakHour + 0.5) * 15; // the dial's entrance: one turn of the hand, ending on the peak hour
let silent = { start: 0, len: 0 }; // longest run of empty hours, treating the day as a circle
if (hourTotal > 0) for (let s = 0; s < 24; s++) {
  if (byHour[s] !== 0 || byHour[(s + 23) % 24] === 0) continue;
  let len = 0; while (len < 24 && byHour[(s + len) % 24] === 0) len++;
  if (len > silent.len) silent = { start: s, len };
}
const silentEnd = (silent.start + silent.len - 1) % 24, resume = (silentEnd + 1) % 24;
const pctEvening = hourTotal ? Math.round((100 * sum(byHour.slice(17))) / hourTotal) : 0;
const langTotal = sum(data.languages.map((l) => l.pct));

// ================================================================== the masthead
function masthead(name) {
  const T = THEME[name]; const d = doc(T);
  const mono = { font: 'mono', size: 11, fill: T.dim, track: TRACK };

  d.rule(0, { color: T.ink });
  const folioY = 22;
  d.text(0, folioY, upper(`No. ${issueNo} · Week ${wk.week} of ${wk.year}`), mono);
  d.text(W / 2, folioY, upper(`${weekdayName(genISO)}, ${longDate(genISO)}`), { ...mono, align: 'middle' });
  d.text(W, folioY, upper(`${P.location} · ${utcOffset}`), { ...mono, align: 'end' });
  d.rule(34);

  // nameplate, sized to the full measure
  const nameSize = r2(Math.max(56, Math.min(132, W / measure(P.name, { size: 1 }))));
  const nameBase = 34 + 26 + 0.67 * nameSize;
  d.text(0, nameBase, P.name, { size: nameSize });

  // deck at left, degrees as marginalia at right
  const deckOpts = { size: 24, italic: true }, stampW = 280, deckMax = W - stampW - 32;
  const deckLines = balancedWrap(DECK, deckOpts, deckMax);
  const deckLead = 32, deckTop = nameBase + 50;
  deckLines.forEach((ln, i) => d.text(0, deckTop + i * deckLead, ln, deckOpts));
  const edu = (P.education || []).slice(0, 2).flatMap((e) => {
    const [degree, ...rest] = e.split(','); const inst = rest.join(',').replace(/\([^)]*\)/g, '').trim();
    return inst ? [degree.trim(), inst] : [degree.trim()];
  });
  edu.forEach((ln, i) => d.text(W, deckTop + i * (deckLead / 2), truncate(upper(ln), FILE.mono, 11, stampW, { letterSpacingEm: TRACK }), { ...mono, align: 'end' }));
  let y = Math.max(deckTop + (deckLines.length - 1) * deckLead, deckTop + (edu.length - 1) * (deckLead / 2));

  // Oxford rule, then the language spectrum: one broken hairline, proportional by bytes
  const oxY = y + 28;
  d.rule(oxY, { color: T.ink, h: 2 }); d.rule(oxY + 4, { color: T.ink });
  const labelY = oxY + 30;
  d.text(0, labelY, upper('Languages, by bytes'), mono);
  d.text(W, labelY, upper(`${data.repos.length} public repositories`), { ...mono, align: 'end' });
  const barY = labelY + 14, gap = 3, barH = 2;
  const avail = W - gap * (data.languages.length - 1);
  let x = 0; const segs = [];
  data.languages.forEach((l) => { const w = Math.max(2, (l.pct / langTotal) * avail); segs.push({ ...l, x, w }); x += w + gap; });
  const scale = W / (x - gap); segs.forEach((s) => { s.x *= scale; s.w *= scale; });
  segs.forEach((s) => d.raw(`<rect x="${r2(s.x)}" y="${barY}" width="${r2(s.w)}" height="${barH}" fill="${T.ink}"/>`));
  const segLabelY = barY + barH + 17, small = { font: 'mono', size: 11, fill: T.dim };
  const unlabelled = [];
  segs.forEach((s) => { const lab = `${s.name} ${Math.round(s.pct)}%`; if (measure(lab, small) <= s.w - 6) d.text(s.x, segLabelY, lab, small); else unlabelled.push(s); });
  const tail = segs.slice(segs.length - unlabelled.length);
  if (unlabelled.length && tail.every((s) => unlabelled.includes(s))) {
    const pct = sum(tail.map((s) => s.pct));
    const lab = tail.length === 1 ? `${tail[0].name} ${Math.round(pct)}%` : `${tail.length} others ${Math.round(pct)}%`;
    const tw = sum(tail.map((s) => s.w)) + gap * (tail.length - 1);
    if (measure(lab, small) <= tw - 2) d.text(W, segLabelY, lab, { ...small, align: 'end' });
  }
  y = segLabelY + 20;
  d.rule(y);
  const H = y + 12;

  const alt = `${P.name} — code and cognition. Issue ${issueNo}, week ${wk.week} of ${wk.year}, ${longDate(genISO)}. ${edu.join(', ')}. Languages by bytes: ${data.languages.slice(0, 4).map((l) => `${l.name} ${Math.round(l.pct)}%`).join(', ')}. ${data.repos.length} public repositories.`;
  return svg(H, alt, d.parts.join(''));
}

// ================================================================== Fig. 1 — the dial
function dial(d, cx, cy, T) {
  const max = Math.max(1, ...byHour);
  const R_TRACK = 112, R0 = 50, LMAX = 56, R_NUM = 126, BAR_W = 6;
  const rad = (hours) => ((hours * 15 - 90) * Math.PI) / 180; // 00 at twelve o'clock, clockwise
  const pt = (hours, r) => [r2(cx + r * Math.cos(rad(hours))), r2(cy + r * Math.sin(rad(hours)))];

  d.raw(`<circle cx="${cx}" cy="${cy}" r="${R_TRACK}" fill="none" stroke="${T.rule}" stroke-width="1"/>`);
  d.raw(`<circle cx="${cx}" cy="${cy}" r="${R0}" fill="none" stroke="${T.rule}" stroke-width="1"/>`);
  for (let h = 0; h < 24; h++) { // hour ticks on the track; the four cardinal ones longer and in ink
    const cardinal = h % 6 === 0;
    const [x1, y1] = pt(h, R_TRACK), [x2, y2] = pt(h, R_TRACK - (cardinal ? 7 : 3.5));
    d.raw(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cardinal ? T.ink : T.dim}" stroke-width="1"/>`);
  }
  if (silent.len >= 3) { // the silent hours stay empty; a curved label sits inside the gap, dial-fashion
    const mid = silent.start + silent.len / 2;
    const label = upper(`silent ${hh(silent.start)}–${hh(resume)}`);
    const size = 10, track = 0.12;
    const tw = textWidth(label, FILE.mono, size, { letterSpacingEm: track });
    const rText = (R0 + R_TRACK) / 2 + 2;
    const m24 = ((mid % 24) + 24) % 24, bottomHalf = m24 > 6 && m24 < 18;
    const half = ((tw / 2 / rText) * (180 / Math.PI)) / 15 + 0.35;
    const r = bottomHalf ? rText - size * 0.7 : rText;
    const [px, py] = pt(bottomHalf ? mid + half : mid - half, r), [qx, qy] = pt(bottomHalf ? mid - half : mid + half, r);
    d.raw(`<defs><path id="silent-arc" d="M${px} ${py} A${r} ${r} 0 0 ${bottomHalf ? 0 : 1} ${qx} ${qy}"/></defs>`);
    d.raw(`<text class="mono" font-size="${size}" fill="${T.dim}" letter-spacing="${r2(track * size)}"><textPath href="#silent-arc" xlink:href="#silent-arc" startOffset="50%" text-anchor="middle">${esc(label)}</textPath></text>`);
  }
  if (hourTotal > 0) { // the hand rests on the peak hour; its static angle is an attribute, so it is right even where CSS never runs
    const tip = R0 + 1 + LMAX + 5;
    d.raw(`<g transform="rotate(${r2(peakDeg)} ${cx} ${cy})"><line class="hand" x1="${cx}" y1="${cy}" x2="${cx}" y2="${r2(cy - tip)}" stroke="${T.accent}" stroke-width="1.25" stroke-linecap="round"/></g>`);
  }
  for (let h = 0; h < 24; h++) { // one bar per hour growing out of the baseline ring as the hand passes; the peak hour is the only accent, and lands last
    const v = byHour[h]; if (!v) continue;
    const len = Math.max(1.5, (LMAX * v) / max);
    const [x1, y1] = pt(h + 0.5, R0 + 1), [x2, y2] = pt(h + 0.5, R0 + 1 + len);
    const delta = ((((h + 0.5) * 15 - peakDeg) % 360) + 360) % 360 || 360; // degrees the hand travels before it reaches this hour
    d.raw(`<line class="bar" pathLength="1" style="animation-delay:${r2((SWEEP * delta) / 360)}s" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${h === peakHour ? T.accent : T.ink}" stroke-width="${BAR_W}"/>`);
  }
  for (let h = 0; h < 24; h += 3) { // numerals: 00 06 12 18 in ink, the quarter hours quieter
    const cardinal = h % 6 === 0, size = cardinal ? 11.5 : 10;
    const [x, y] = pt(h, R_NUM);
    d.text(x, y + size * 0.36, hh(h), { font: 'mono', size, fill: cardinal ? T.ink : T.dim, align: 'middle' });
  }
  d.raw(`<circle cx="${cx}" cy="${cy}" r="1.75" fill="${T.ink}"/>`);
  d.text(cx, cy + 20, 'IST', { font: 'mono', size: 9.5, fill: T.dim, align: 'middle', track: 0.14 });
}
function weekMarks(d, x, yBase, T) {
  const max = Math.max(1, ...byWeekday), pitch = 14, bw = 6, hmax = 30;
  d.rule(yBase, { x0: x - 4, x1: x + pitch * 6 + bw + 4 });
  byWeekday.forEach((v, i) => {
    const h = Math.max(1.5, (hmax * v) / max);
    d.raw(`<rect x="${x + i * pitch}" y="${r2(yBase - h)}" width="${bw}" height="${r2(h)}" fill="${T.ink}"/>`);
    d.text(x + i * pitch + bw / 2, yBase + 14, WEEKDAYS[i][0], { font: 'mono', size: 9.5, fill: T.dim, align: 'middle' });
  });
  return pitch * 6 + bw;
}
function clock(name) {
  const T = THEME[name]; const d = doc(T);
  const H = 322;
  const sentences = [`Public commits by hour of the day, IST (n = ${thousands(hourTotal)}).`];
  if (silent.len > 0) sentences.push(`Silent from ${hh(silent.start)}:00 to ${hh(silentEnd)}:59; back by ${hh(resume)}:00; the peak is ${hh(peakHour)}:00.`);
  else if (hourTotal > 0) sentences.push(`Never fully silent; the quietest hour is ${hh(argmin(byHour))}:00 and the peak is ${hh(peakHour)}:00.`);
  if (hourTotal > 0) sentences.push(`${pctEvening}% of commits land after 17:00.`);
  const caption = sentences.join(' ');
  const wkTotal = sum(byWeekday);
  const weekLine = wkTotal > 0 && byWeekday[argmax(byWeekday)] !== byWeekday[argmin(byWeekday)]
    ? `By weekday: ${WEEKDAYS[argmax(byWeekday)]} heaviest, ${WEEKDAYS[argmin(byWeekday)]} lightest.` : 'By weekday: an even spread.';

  const cx = 140, cy = 162;
  dial(d, cx, cy, T);

  const x = 372, colW = W - x;
  let y = 46;
  d.text(x, y, 'FIG. 1', { font: 'mono', size: 10.5, fill: T.dim, track: 0.12 });
  y += 36;
  d.text(x - 1, y, 'When I commit', { size: 28 });
  y += 30;
  const capOpts = { size: 15.5, italic: true }, lead = 23;
  for (const ln of balancedWrap(caption, capOpts, colW)) { d.text(x, y, ln, capOpts); y += lead; }
  y += 40;
  const marksW = weekMarks(d, x, y, T);
  const weekText = balancedWrap(weekLine, { font: 'mono', size: 11.5 }, colW - marksW - 24);
  let wy = y - 10 - (weekText.length - 1) * 16;
  for (const ln of weekText) { d.text(x + marksW + 24, wy, ln, { font: 'mono', size: 11.5, fill: T.dim }); wy += 16; }

  const anim =
    `.hand{transform-origin:${cx}px ${cy}px;animation:sweep ${SWEEP}s linear both}` +
    `@keyframes sweep{from{transform:rotate(-360deg)}to{transform:rotate(0deg)}}` +
    `.bar{stroke-dasharray:1 1;animation:grow .4s cubic-bezier(.2,.7,.2,1) both}` +
    `@keyframes grow{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}` +
    `@media (prefers-reduced-motion:reduce){.hand,.bar{animation:none}}`;
  const alt = `Figure 1, when I commit: ${caption} ${weekLine}`;
  return svg(H, alt, d.parts.join(''), { css: anim });
}

// ================================================================== Fig. 2 — a year as one trace
function year(name) {
  const T = THEME[name]; const d = doc(T);
  const mono = { font: 'mono', size: 11, fill: T.dim, track: TRACK };
  const PLOT_TOP = 114, PLOT_H = 118, BASE = PLOT_TOP + PLOT_H, TICK = 5, H = BASE + 1 + TICK + 13 + 10;
  const PW = W - 4; // the pen dot needs a little room at the right edge
  const by = BASE + 0.5, scale = PLOT_H / Math.max(1, Math.sqrt(peak)); // square-root scale: a record day must not flatten the rest of the year

  let y = 22;
  d.text(0, y, 'FIG. 2', { font: 'mono', size: 10.5, fill: T.dim, track: 0.12 });
  d.text(W, y, upper(`${days.length} days to ${longDate(days[days.length - 1].date)}`), { ...mono, align: 'end' });
  y += 32;
  const streaks = `Longest streak ${C.longestStreak} days` + (C.currentStreak >= 3 ? `; current streak ${C.currentStreak}` : '');
  const caption = `Contributions per day (n = ${thousands(sum(counts))}), active on ${activeDays} of ${days.length} days. ${streaks}` +
    (peak > 0 ? `; the peak is ${peak} on ${dayMonth(days[peakIdx].date)}.` : '.') + ' Square-root scale.';
  const capOpts = { size: 15.5, italic: true };
  for (const ln of balancedWrap(caption, capOpts, W)) { d.text(0, y, ln, capOpts); y += 23; }

  const pts = counts.map((c, i) => ({ x: (i * PW) / (counts.length - 1), y: by - Math.sqrt(c) * scale }));
  let path = `M${r2(pts[0].x)} ${r2(pts[0].y)}`, length = 0;
  for (let i = 1; i < pts.length; i++) { path += `L${r2(pts[i].x)} ${r2(pts[i].y)}`; length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); }
  const dash = Math.ceil(length * 1.02 + 12);
  const area = `${path}L${r2(pts[pts.length - 1].x)} ${r2(by)}L${r2(pts[0].x)} ${r2(by)}Z`;

  d.rule(BASE);
  days.forEach((day, i) => { // a tick and a label on the first of each month inside the window
    if (dateUTC(day.date).getUTCDate() !== 1) return;
    const x = Math.round(pts[i].x);
    d.rule(BASE + 1, { x0: x, x1: x + 1, h: TICK });
    const lab = upper(MONTHS[dateUTC(day.date).getUTCMonth()].slice(0, 3));
    if (x + 5 + measure(lab, mono) <= W) d.text(x + 5, BASE + 1 + TICK + 13, lab, mono);
  });
  d.raw(`<path class="wash late" d="${area}" fill="${T.ink}" fill-opacity="${T.wash}"/>`);
  d.raw(`<path class="trace" d="${path}" fill="none" stroke="${T.ink}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  const last = pts[pts.length - 1];
  d.raw(`<circle class="late" cx="${r2(last.x)}" cy="${r2(last.y)}" r="3" fill="${T.accent}"/>`);
  if (peak > 0) { // the busiest day, annotated above its tip and kept inside the canvas
    const lab = upper(`${peak} · ${dayMonth(days[peakIdx].date)}`);
    const lw = measure(lab, mono);
    d.text(Math.min(Math.max(pts[peakIdx].x - lw / 2, 0), W - lw), PLOT_TOP - 9, lab, mono);
  }

  const anim =
    `.trace{stroke-dasharray:${dash};stroke-dashoffset:0;animation:draw 1.1s cubic-bezier(.35,0,.15,1) .05s both}` +
    `@keyframes draw{from{stroke-dashoffset:${dash}}to{stroke-dashoffset:0}}` +
    `.late{animation:fade .35s ease-out 1s both}@keyframes fade{from{opacity:0}to{opacity:1}}` +
    `@media (prefers-reduced-motion:reduce){.trace,.late{animation:none}}`;
  const alt = `Figure 2, a year as one trace: ${caption}`;
  return svg(H, alt, d.parts.join(''), { css: anim, faces: ['italic', 'mono'] });
}

// ================================================================== section rules and the colophon
function sectionRule(name, label) {
  const T = THEME[name]; const d = doc(T);
  d.rule(8);
  d.text(0, 31, upper(label), { font: 'mono', size: 11, fill: T.dim, track: TRACK });
  return svg(34, label, d.parts.join(''), { faces: ['mono'] });
}
function foot(name) {
  const T = THEME[name]; const d = doc(T);
  const mono = { font: 'mono', size: 11, fill: T.dim, track: TRACK };
  d.rule(8);
  const right = upper(`No. ${issueNo}`), rw = measure(right, mono);
  const left = upper(`Published ${longDate(genISO)} · redrawn every morning from public activity · Newsreader & DM Mono`);
  d.text(0, 31, truncate(left, FILE.mono, 11, W - rw - 40, { letterSpacingEm: TRACK }), mono);
  d.text(W, 31, right, { ...mono, align: 'end' });
  return svg(37, `Colophon: published ${longDate(genISO)}, redrawn every morning from public GitHub activity, set in Newsreader and DM Mono; issue ${issueNo}.`, d.parts.join(''), { faces: ['mono'] });
}

// ------------------------------------------------------------------ write
for (const name of ['light', 'dark']) {
  const files = {
    [`masthead-${name}.svg`]: masthead(name),
    [`clock-${name}.svg`]: clock(name),
    [`year-${name}.svg`]: year(name),
    [`rule-work-${name}.svg`]: sectionRule(name, 'Selected work'),
    [`rule-print-${name}.svg`]: sectionRule(name, 'In print'),
    [`foot-${name}.svg`]: foot(name),
  };
  for (const [file, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, file), body);
    console.log(`${file.padEnd(22)} ${String(Buffer.byteLength(body)).padStart(7)} bytes`);
  }
}
