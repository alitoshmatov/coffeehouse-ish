import { useMemo, type MouseEvent } from "react";
import type { CupKind, RecipeSize, SceneLayer } from "@/shared/types";

/**
 * Cutaway picture of a drink being built. The server sends, for every step,
 * what that step does (RecipeSize.scene); here we replay the steps up to the
 * current one and draw the cup, pitcher/blender, layers, ice, lid…
 * Layers are drawn to scale against the cup's volume. Tap a layer → onTip(label).
 *
 * The current step is animated: the espresso machine pours twin streams, milk
 * comes from a carton, the pitcher steams with a thermometer, the blender spins,
 * ice drops and bounces, the muddler presses, the pitcher tilts and pours…
 * Animations are CSS classes (cs-*) defined in src/index.css.
 */

const COL: Record<string, string> = {
  kofe: "#3b2216",
  sut: "#f2ece2",
  foam: "#fffaf3",
  slivki: "#f1dfb8",
  sirop: "#b5681f",
  kakao: "#5b331e",
  laimon: "#d5e98a",
  banan: "#efd067",
  qul: "#e46a7c",
  konst: "#e8892d",
  asal: "#d89a27",
  suv: "#d3e3ea",
  choysuv: "#d39a52",
  smes: "#faf0dc",
  muz: "#e1f2fc",
};
const INK = "#251B14";
const LID = "#2b2522";
const EMBER = "#71292A";

type Layer = SceneLayer & { col: string; fresh: boolean; foam?: boolean; stir?: boolean };
type Side = { type: "pitcher" | "blender"; layers: Layer[]; mixed: boolean };
type Flag = 0 | 1 | 2; // 0 none · 1 present · 2 appeared on this step (animate)
type Src = { to: "cup" | "pitcher" | "blender"; key: string; col: string };
export interface SceneState {
  cup: Flag;
  layers: Layer[];
  side: Side | null;
  ice: Flag;
  slices: Flag;
  slicesAmount: string;
  mint: Flag;
  mintAmount: string;
  teabag: Flag;
  lid: Flag;
  grind: string | null;
  steam: boolean;
  steamTemp: string;
  blend: boolean;
  muddle: boolean; // muddler working on this step
  muddled: boolean; // lemon/mint already crushed
  stirNow: boolean; // spoon stirring on this step
  src: Src | null; // last thing added on this step — draws where it comes from
  pourFx: { from: "pitcher" | "blender"; col: string } | null; // poured into the cup on this step
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a: number[]) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** k > 0 lightens toward white, k < 0 darkens. */
const shade = (c: string, k: number) => toHex(hex(c).map((v) => (k > 0 ? v + (255 - v) * k : v * (1 + k))));
/** Colour of a mixed drink. Espresso and syrups tint strongly; ice barely does. */
const TINT: Record<string, number> = { kofe: 4, kakao: 3, sirop: 2, muz: 0.4 };
function mix(ls: { vol: number; col: string; key?: string }[]) {
  let t = 0;
  let a = [0, 0, 0];
  for (const l of ls) {
    const w = Math.max(l.vol, 1) * (TINT[l.key ?? ""] ?? 1);
    const h = hex(l.col);
    t += w;
    a = a.map((v, i) => v + h[i] * w);
  }
  return toHex(a.map((v) => v / t));
}
const sum = (ls: { vol: number }[]) => ls.reduce((a, l) => a + l.vol, 0);

/** Replays steps 0..upto (upto = -1 → nothing done yet). */
export function applyScene(size: RecipeSize, upto: number): SceneState {
  const S: SceneState = {
    cup: 0, layers: [], side: null, ice: 0, slices: 0, slicesAmount: "", mint: 0, mintAmount: "", teabag: 0,
    lid: 0, grind: null, steam: false, steamTemp: "60–65 °C", blend: false, muddle: false, muddled: false,
    stirNow: false, src: null, pourFx: null,
  };
  const scene = size.scene ?? [];
  for (let i = 0; i <= upto && i < scene.length; i++) {
    const fr = i === upto;
    const f: Flag = fr ? 2 : 1;
    S.grind = null;
    S.steam = false;
    S.blend = false;
    S.muddle = false;
    S.stirNow = false;
    S.src = null;
    S.pourFx = null;
    S.layers.forEach((l) => (l.stir = false));
    for (const o of scene[i]) {
      switch (o.op) {
        case "cup": S.cup = f; break;
        case "grind": S.grind = fr ? o.amount : null; break;
        case "add": {
          const l: Layer = { ...o.layer, col: COL[o.layer.key] ?? "#cccccc", fresh: fr };
          if (o.to === "cup") {
            const top = S.layers[S.layers.length - 1];
            // espresso poured on milk foam sinks under the foam (latte macchiato layers)
            if (l.key === "kofe" && top?.foam) S.layers.splice(S.layers.length - 1, 0, l);
            else S.layers.push(l);
          } else {
            if (!S.side) S.side = { type: o.to, layers: [], mixed: false };
            S.side.layers.push(l);
          }
          if (fr) S.src = { to: o.to, key: l.key, col: l.col };
          break;
        }
        case "steam":
        case "blend":
          if (S.side) S.side.mixed = true;
          if (o.op === "steam" && o.temp) S.steamTemp = o.temp;
          if (fr) S[o.op === "steam" ? "steam" : "blend"] = true;
          break;
        case "pour": {
          if (!S.side) break;
          const t = sum(S.side.layers);
          const col = mix(S.side.layers);
          if (o.foam < 1)
            S.layers.push({ key: "mix", label: o.label, vol: t * (1 - o.foam), amount: `≈ ${Math.round(t * (1 - o.foam))} ml`, col, fresh: fr });
          if (o.foam > 0)
            S.layers.push({ key: "foam", label: "Ko‘pik", vol: t * o.foam * 1.6, amount: "ustki qatlam", col: COL.foam, fresh: fr, foam: true });
          if (fr) S.pourFx = { from: S.side.type, col };
          S.side = null;
          break;
        }
        case "stir": {
          const t = sum(S.layers);
          S.layers = [{ key: "mix", label: o.label, vol: t, amount: `≈ ${Math.round(t)} ml`, col: mix(S.layers), fresh: false, stir: fr }];
          S.stirNow = fr;
          break;
        }
        case "ice": S.ice = f; break;
        case "slices": S.slices = f; S.slicesAmount = o.amount; break;
        case "mint": S.mint = f; S.mintAmount = o.amount; break;
        case "muddle": S.muddle = fr; S.muddled = true; break;
        case "teabag": S.teabag = f; break;
        case "lid": S.lid = f; break;
      }
    }
  }
  return S;
}

const GEO: Record<CupKind, { top: number; tw: number; bw: number; cold?: boolean }> = {
  s: { top: 122, tw: 104, bw: 76 },
  m: { top: 94, tw: 116, bw: 82 },
  l: { top: 66, tw: 126, bw: 88 },
  c5: { top: 98, tw: 118, bw: 84, cold: true },
  c7: { top: 62, tw: 130, bw: 90, cold: true },
  icup: { top: 196, tw: 92, bw: 70 },
  cone: { top: 178, tw: 86, bw: 2 },
};
const CAP: Record<CupKind, number> = { s: 250, m: 350, l: 450, c5: 500, c7: 700, cone: 160, icup: 160 };
const BOT = 250;
const SX = 238; // centre of the side station (grinder, pitcher, blender)
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
let uid = 0;
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Small deterministic random generator, so pictures don't jump between renders. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Total cup volume of the finished drink — keeps the scale the same on every step. */
export function fullVolume(size: RecipeSize) {
  return sum(applyScene(size, (size.scene?.length ?? 0) - 1).layers);
}

/* ── small drawings ── */
const heart = (x: number, y: number, w: number, h: number, fill: string) =>
  `<path d="M${r1(x)} ${r1(y + 0.75 * h)}C${r1(x - 1.15 * w)} ${r1(y - 0.1 * h)} ${r1(x - 0.55 * w)} ${r1(y - 1.1 * h)} ${r1(x)} ${r1(y - 0.35 * h)}C${r1(x + 0.55 * w)} ${r1(y - 1.1 * h)} ${r1(x + 1.15 * w)} ${r1(y - 0.1 * h)} ${r1(x)} ${r1(y + 0.75 * h)}Z" fill="${fill}"/>`;

/** A pouring stream with a moving highlight, plus a splash where it lands. */
function stream(x1: number, y1: number, x2: number, y2: number, col: string, w: number, cls = "cs-stream", splash = true) {
  const d = `M${r1(x1)} ${r1(y1)}Q${r1(x1 + (x2 - x1) * 0.15)} ${r1((y1 + y2) / 2)} ${r1(x2)} ${r1(y2)}`;
  let s = `<g class="${cls}"><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  s += `<path class="cs-flow" d="${d}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="${Math.max(1, w / 3)}" stroke-linecap="round"/>`;
  if (splash)
    for (let i = 0; i < 4; i++)
      s += `<circle class="cs-splash" style="--dx:${[-11, -5, 6, 12][i]}px;animation-delay:${i * 0.12}s" cx="${r1(x2)}" cy="${r1(y2)}" r="${i % 2 ? 1.6 : 2.2}" fill="${col}"/>`;
  return s + `</g>`;
}

/** Espresso machine group head + portafilter with a double spout, pouring two thin streams down to y2. */
function machine(id: string, x: number, ys: number, y2: number) {
  let s = `<g class="cs-in"><rect x="${x - 46}" y="${ys - 62}" width="92" height="34" rx="5" fill="${LID}"/>`;
  s += `<rect x="${x - 46}" y="${ys - 32}" width="92" height="4" fill="#4a403b"/><circle cx="${x + 32}" cy="${ys - 45}" r="4" fill="${EMBER}"/><circle cx="${x + 32}" cy="${ys - 45}" r="1.5" fill="#e98b6d" class="cs-blink"/>`;
  s += `<rect x="${x - 17}" y="${ys - 28}" width="34" height="9" rx="2" fill="url(#${id}mt)" stroke="#6d757b" stroke-width=".8"/>`;
  s += `<path d="M${x - 21} ${ys - 19}h42l-5 11h-32z" fill="url(#${id}mt)" stroke="#6d757b" stroke-width=".9"/>`;
  s += `<path d="M${x - 21} ${ys - 15}L${x - 60} ${ys - 6}" stroke="#1d1a18" stroke-width="8" stroke-linecap="round"/>`;
  s += `<rect x="${x - 8}" y="${ys - 8}" width="5" height="8" rx="1" fill="#7d848a"/><rect x="${x + 3}" y="${ys - 8}" width="5" height="8" rx="1" fill="#7d848a"/></g>`;
  for (const [a, b] of [
    [x - 5.5, x - 2],
    [x + 5.5, x + 2],
  ]) {
    const d = `M${a} ${ys}Q${a} ${r1((ys + y2) / 2)} ${b} ${r1(y2)}`;
    s += `<g class="cs-stream2"><path d="${d}" stroke="#6b3a1f" stroke-width="2.6" stroke-linecap="round" fill="none"/><path class="cs-flow" d="${d}" stroke="#c88a52" stroke-width="1.2" stroke-linecap="round" fill="none"/></g>`;
  }
  return s;
}

/** Where an added ingredient comes from, drawn above the target with a stream to (x, y2). */
function source(id: string, key: string, col: string, x: number, top: number, y2: number) {
  if (key === "kofe") return machine(id, x, Math.max(36, top - 34), y2);
  if (key === "muz") return ""; // ice cubes animate themselves
  const px = x + 10, py = Math.max(30, top - 22);
  if (key === "suv" || key === "choysuv") {
    // hot-water tap from the right
    let s = `<g class="cs-src"><rect x="${x - 6}" y="${py - 26}" width="80" height="11" rx="5" fill="url(#${id}mt)" stroke="#6d757b" stroke-width=".8"/>`;
    s += `<rect x="${x - 7}" y="${py - 18}" width="14" height="14" rx="3" fill="url(#${id}mt)" stroke="#6d757b" stroke-width=".8"/><rect x="${x + 24}" y="${py - 40}" width="6" height="16" rx="3" fill="${LID}"/>`;
    s += stream(x, py - 4, x, y2, key === "suv" ? "#bcd8e6" : "#e6c08a", 6, "", true);
    if (key === "choysuv") for (let i = 0; i < 2; i++) s += `<path class="cs-wisp" style="animation-delay:${i * 0.6}s" d="M${x - 12 + i * 22} ${y2 - 6}q-5 -9 0 -18q5 -9 0 -18" fill="none" stroke="#9a8d82" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>`;
    return s + `</g>`;
  }
  if (key === "kakao") {
    let s = `<g class="cs-src"><path d="M${x + 6} ${py}L${x + 58} ${py - 34}" stroke="#aeb4b9" stroke-width="4" stroke-linecap="round"/>`;
    s += `<ellipse cx="${x}" cy="${py + 2}" rx="12" ry="5" fill="url(#${id}mt)" stroke="#6d757b" stroke-width=".8" transform="rotate(-25 ${x} ${py + 2})"/><ellipse cx="${x - 1}" cy="${py}" rx="8" ry="3.4" fill="${col}" transform="rotate(-25 ${x} ${py})"/>`;
    for (let i = 0; i < 12; i++)
      s += `<circle class="cs-fall" style="--fy:${r1(y2 - py - 4)}px;animation-delay:${(i * 0.09).toFixed(2)}s" cx="${x - 6 + (i % 4) * 3}" cy="${py + 6}" r="${i % 3 ? 1.2 : 1.7}" fill="${col}"/>`;
    return s + `</g>`;
  }
  if (key === "banan" || key === "qul") {
    let s = `<g class="cs-src">`;
    for (let i = 0; i < 5; i++) {
      const xx = x - 14 + i * 7, d = `animation-delay:${i * 0.14}s;--fy:${r1(y2 - py + 10)}px`;
      s +=
        key === "banan"
          ? `<g class="cs-fallonce" style="${d}"><circle cx="${xx}" cy="${py - 10}" r="6" fill="#f6e3a1" stroke="#d8b84a"/><circle cx="${xx}" cy="${py - 10}" r="1.6" fill="#b89a3c"/></g>`
          : `<g class="cs-fallonce" style="${d}"><path d="M${xx} ${py - 4}c-7 -4 -7 -12 0 -12c7 0 7 8 0 12z" fill="${COL.qul}" stroke="#b8394c"/><path d="M${xx - 3} ${py - 15}l3 -3l3 3" stroke="#3f8a3d" stroke-width="2" fill="none"/></g>`;
    }
    return s + `</g>`;
  }
  if (key === "smes") {
    let s = `<g class="cs-in"><rect x="${x - 30}" y="${py - 54}" width="60" height="30" rx="6" fill="#e9e3dc" stroke="#b9aea3"/><rect x="${x - 7}" y="${py - 24}" width="14" height="12" fill="url(#${id}mt)"/>`;
    s += `<path d="M${x - 7} ${py - 12}l3 6h8l3 -6z" fill="#8d9399"/><rect x="${x + 14}" y="${py - 62}" width="5" height="18" rx="2" fill="${EMBER}"/></g>`;
    return s + stream(x, py - 6, x, y2, col, 11, "cs-stream", false);
  }
  // pouring bottle or carton, tilted with the mouth at (px, py)
  const carton = key === "sut" || key === "slivki";
  const label = { sut: "SUT", slivki: "SLIVKI", laimon: "FRESH", sirop: "SIROP", asal: "ASAL", konst: "CHOY" }[key] ?? "";
  const body = carton
    ? `<path d="M0 0L13 -9L26 0V46H0Z" fill="#fbfbf8" stroke="#a9a49c" stroke-width="1"/><rect x="0" y="16" width="26" height="15" fill="${key === "sut" ? "#3f7fc4" : "#c79a3d"}"/>`
    : `<rect x="-3.5" y="-2" width="7" height="12" rx="2" fill="${shade(col, -0.25)}"/><path d="M-4 10Q-12 14 -12 22V56H12V22Q12 14 4 10Z" fill="${key === "laimon" ? "#b9dc7a" : col}" fill-opacity=".92" stroke="${shade(col, -0.4)}" stroke-width="1"/><rect x="-12" y="30" width="24" height="13" fill="#fff" fill-opacity=".9"/>`;
  const tx = carton ? 13 : 0, ty = carton ? 26.5 : 39.5;
  let s = `<g class="cs-src"><g transform="translate(${px} ${py}) rotate(-118)"><g><animateTransform attributeName="transform" type="rotate" from="55" to="0" dur=".5s" fill="freeze"/>${body}`;
  s += `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${carton ? "#fff" : INK}" font-family="Inter,system-ui,sans-serif">${label}</text></g></g>`;
  s += stream(px, py, x, y2, col, carton || key === "laimon" ? 6 : 3.5, "", true);
  return s + `</g>`;
}

/* ── the picture ── */
export function sceneSvg(kind: CupKind, S: SceneState, o: { mini?: boolean; full?: number; crop?: boolean } = {}): string {
  const mini = !!o.mini;
  const live = !mini;
  const g = GEO[kind];
  const W = mini ? 150 : 300;
  const cx = mini ? 75 : 112;
  const id = "cs" + ++uid;
  const Lx = cx - g.tw / 2, Rx = cx + g.tw / 2, bl = cx - g.bw / 2, br = cx + g.bw / 2, cap = CAP[kind];
  const sweet = kind === "cone" || kind === "icup";
  const hot = !g.cold && !sweet;
  const A = (c: string, on: boolean | number = true) => (on && live ? ` class="${c}"` : "");
  const rimRy = r1(g.tw * 0.085), botRy = r1(g.bw * 0.085);
  const wAt = (y: number) => g.tw + ((g.bw - g.tw) * (y - g.top)) / (BOT - g.top);
  const y0 = o.crop ? Math.max(0, g.top - 90) : live ? -26 : 0;
  const edge = `M${Lx} ${g.top}L${bl} ${BOT}A${g.bw / 2} ${botRy} 0 0 0 ${br} ${BOT}L${Rx} ${g.top}`; // outline without the rim line
  const body = edge + "Z";
  const inner = `M${Lx + 2.5} ${g.top}L${bl + 2.5} ${BOT - 1}A${g.bw / 2 - 2.5} ${Math.max(0.5, botRy - 1)} 0 0 0 ${br - 2.5} ${BOT - 1}L${Rx - 2.5} ${g.top}Z`;

  let s = `<svg viewBox="0 ${y0} ${W} ${290 - y0 - (mini ? 30 : 0)}" xmlns="http://www.w3.org/2000/svg"><defs>`;
  s += `<clipPath id="${id}c"><path d="${inner}"/></clipPath>`;
  s += `<linearGradient id="${id}sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".24"/><stop offset=".2" stop-color="#fff" stop-opacity=".2"/><stop offset=".32" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`;
  s += `<linearGradient id="${id}kr" x1="0" x2="1"><stop offset="0" stop-color="#a87f53"/><stop offset=".3" stop-color="#dcbd94"/><stop offset=".65" stop-color="#c9a57a"/><stop offset="1" stop-color="#9c754b"/></linearGradient>`;
  s += `<linearGradient id="${id}gl" x1="0" x2="1"><stop offset="0" stop-color="#bcd8e6" stop-opacity=".55"/><stop offset=".25" stop-color="#ffffff" stop-opacity=".35"/><stop offset=".7" stop-color="#dcecf4" stop-opacity=".15"/><stop offset="1" stop-color="#9fc3d6" stop-opacity=".5"/></linearGradient>`;
  s += `<linearGradient id="${id}mt" x1="0" x2="1"><stop offset="0" stop-color="#7d848a"/><stop offset=".28" stop-color="#eef1f3"/><stop offset=".5" stop-color="#a9b0b5"/><stop offset=".72" stop-color="#f6f8f9"/><stop offset="1" stop-color="#737a80"/></linearGradient>`;
  s += `<linearGradient id="${id}ic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".6" stop-color="#d6ecf7" stop-opacity=".6"/><stop offset="1" stop-color="#a9d3ea" stop-opacity=".75"/></linearGradient>`;
  s += `<radialGradient id="${id}cr" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#d9a066"/><stop offset=".7" stop-color="#b57a43"/><stop offset="1" stop-color="#8a5429"/></radialGradient>`;
  s += `<radialGradient id="${id}sd"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
  s += `<radialGradient id="${id}ss" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffdf8"/><stop offset=".7" stop-color="#f7ead2"/><stop offset="1" stop-color="#e6d3ae"/></radialGradient>`;
  s += `<pattern id="${id}fp" width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#e6d8c5"/><circle cx="5.5" cy="4.5" r=".8" fill="#ece1d2"/></pattern>`;
  s += `<filter id="${id}bl" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0 1.8"/></filter>`;
  s += `</defs>`;

  // counter shadows
  s += `<ellipse cx="${cx}" cy="${BOT + botRy + 3}" rx="${(sweet ? g.tw / 2 : g.bw / 2) + 20}" ry="8" fill="url(#${id}sd)"/>`;
  if (live && (S.side || S.grind)) s += `<ellipse cx="${SX}" cy="${BOT + 4}" rx="52" ry="8" fill="url(#${id}sd)"/>`;

  /* empty cup outline */
  if (!S.cup) {
    s += `<path d="${edge}" fill="none" stroke="${INK}" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="5 5"/>`;
    s += `<ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2}" ry="${rimRy}" fill="none" stroke="${INK}" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  } else if (kind !== "cone") {
    // back of the cup: wall + inside rim
    s += `<g${A("cs-drop", S.cup === 2)}>`;
    if (kind === "icup") s += `<path d="${body}" fill="#fff"/>`;
    else s += `<path d="${body}" fill="url(#${g.cold ? id + "gl" : id + "kr"})" opacity="${g.cold ? 0.75 : 0.32}"/>`;
    s += `<ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2}" ry="${rimRy}" fill="${g.cold ? "#eef6fa" : "#f3ebe0"}" opacity="${g.cold ? 0.6 : 0.9}"/></g>`;
  }

  let stirTop = 0;
  let surfaceY = BOT; // top of the liquid
  if (!sweet) {
    const H = BOT - 3 - (g.top + 8);
    const sc = Math.min(1, (0.92 * cap) / Math.max(o.full || sum(S.layers), 1));
    let y = BOT;
    const pos = S.layers.map((l) => {
      const h = Math.max(3, (l.vol / cap) * H * sc);
      y -= h;
      return { l, y, h };
    });
    surfaceY = pos.length ? pos[pos.length - 1].y : BOT;
    s += `<g clip-path="url(#${id}c)"><g filter="url(#${id}bl)">`;
    pos.forEach(({ l, y, h }, i) => {
      const yb = i === 0 ? BOT + botRy + 2 : y + h + 0.8;
      let b = `<rect x="${Lx}" y="${r1(y)}" width="${g.tw}" height="${r1(yb - y)}" fill="${l.col}"/>`;
      const cls = ["cs-ly", l.fresh && live ? "cs-pour" : "", l.stir && live ? "cs-wob" : ""].join(" ").trim();
      s += `<g class="${cls}" data-tip="${esc(`${l.label}: ${l.amount}`)}">${b}</g>`;
    });
    s += `</g>`;
    pos.forEach(({ l, y, h }) => {
      if (l.foam) s += `<rect${A("cs-fadein", l.fresh)} x="${Lx}" y="${r1(y + 2)}" width="${g.tw}" height="${r1(h - 2)}" fill="url(#${id}fp)" opacity=".8" pointer-events="none"/>`;
    });

    // liquid surface (an ellipse, so the cup reads as round)
    if (pos.length) {
      const top = pos[pos.length - 1];
      const rx = wAt(top.y) / 2 - 3, ry = Math.max(2.2, rx * 0.14);
      const below = pos.length > 1 ? pos[pos.length - 2].l : null;
      const tl = top.l;
      const fill = tl.foam ? "#fbf5ec" : tl.key === "kofe" ? `url(#${id}cr)` : shade(tl.col, 0.14);
      let d = `<ellipse cx="${cx}" cy="${r1(top.y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}"/>`;
      const rnd = rng(11);
      if (tl.key === "kofe")
        for (let i = 0; i < 12; i++) d += `<circle cx="${r1(cx + (rnd() - 0.5) * rx * 1.5)}" cy="${r1(top.y + (rnd() - 0.5) * ry * 1.2)}" r="${r1(0.6 + rnd())}" fill="#ecc28c" opacity=".75"/>`;
      if (tl.foam && hot) {
        if (below?.key === "kofe") d += `<ellipse cx="${cx}" cy="${r1(top.y)}" rx="${r1(rx * 0.22)}" ry="${r1(ry * 0.4)}" fill="#c08a58"/>`;
        else if (S.layers.some((l) => l.key === "kofe" || l.label === "Raf")) {
          d += `<ellipse cx="${cx}" cy="${r1(top.y)}" rx="${r1(rx * 0.86)}" ry="${r1(ry * 0.82)}" fill="#c69060"/>`;
          d += heart(cx, top.y + ry * 0.05, rx * 0.36, ry * 0.62, "#fbf5ec");
        } else for (let i = 0; i < 16; i++) d += `<circle cx="${r1(cx + (rnd() - 0.5) * rx * 1.6)}" cy="${r1(top.y + (rnd() - 0.5) * ry * 1.4)}" r=".9" fill="#7a4a2c" opacity=".55"/>`;
      }
      s += `<g class="cs-ly${tl.fresh && live ? " cs-fadein" : ""}" data-tip="${esc(`${tl.label}: ${tl.amount}`)}">${d}</g>`;
      if (tl.fresh && live)
        s += `<ellipse class="cs-ripple" cx="${cx}" cy="${r1(top.y)}" rx="${r1(rx * 0.6)}" ry="${r1(ry * 0.6)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>`;
      if (live && S.stirNow) {
        stirTop = top.y;
        s += `<ellipse class="cs-swirl" cx="${cx}" cy="${r1(top.y)}" rx="${r1(rx * 0.55)}" ry="${r1(ry * 0.55)}" fill="none" stroke="${shade(tl.col, -0.25)}" stroke-width="2" stroke-dasharray="14 8"/>`;
      }
    }

    // rising bubbles in cold drinks
    if (live && g.cold && pos.length && sum(S.layers) > 60) {
      const rb = rng(5);
      for (let i = 0; i < 8; i++)
        s += `<circle class="cs-bub" style="animation-delay:${(rb() * 3).toFixed(2)}s;animation-duration:${(2.4 + rb() * 1.6).toFixed(2)}s" cx="${r1(cx + (rb() - 0.5) * g.bw * 0.8)}" cy="${BOT - 6}" r="${r1(0.9 + rb() * 1.3)}" fill="#fff" fill-opacity=".7"/>`;
    }

    // tea bag inside, with infusion wisps
    if (S.teabag) {
      const bx = Rx - 34, by = BOT - 58;
      s += `<g${A("cs-drop", S.teabag === 2)} data-tip="Choy paketchasi: 1 dona" class="cs-ly"><rect x="${bx}" y="${by}" width="20" height="26" rx="3" fill="#e6d3ab" stroke="#b89a62"/>`;
      for (let i = 0; i < 6; i++) s += `<circle cx="${bx + 5 + (i % 3) * 5}" cy="${by + 9 + Math.floor(i / 3) * 7}" r="1.4" fill="#8a5a2b"/>`;
      s += `</g>`;
      if (live && S.layers.length)
        for (let i = 0; i < 3; i++)
          s += `<path class="cs-infuse" style="animation-delay:${i * 0.9}s" d="M${bx + 10} ${by}q${-10 + i * 6} -14 ${-4 + i * 4} -30" fill="none" stroke="#a6561f" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>`;
    }

    // lemon half-moons (crescent slices) and mint leaves
    const rs = rng(23);
    if (S.slices) {
      const n = Math.max(1, Math.min(6, parseInt(S.slicesAmount, 10) || 3));
      for (let i = 0; i < n; i++) {
        const xx = cx - 22 + (n > 1 ? (44 * i) / (n - 1) : 22) + (rs() - 0.5) * 8, yy = BOT - 16 - (i % 2) * 14 - rs() * 6;
        const rot = r1((rs() - 0.5) * 70 + (i % 2 ? 180 : 0));
        let seg = "";
        for (let k = 1; k < 5; k++) {
          const a = Math.PI + (k * Math.PI) / 5;
          seg += `M0 0L${r1(Math.cos(a) * 10)} ${r1(Math.sin(a) * 10)}`;
        }
        s += `<g transform="translate(${r1(xx)} ${r1(yy)}) rotate(${rot})${S.muddled ? " scale(1 .78)" : ""}"><g${A("cs-drop", S.slices === 2)} style="animation-delay:${i * 0.12}s" class="cs-ly" data-tip="${esc(`Limon: ${S.slicesAmount}`)}">`;
        s += `<path d="M-13 0A13 13 0 0 1 13 0Z" fill="#f8ee9e" stroke="#d6bf22" stroke-width="3" stroke-linejoin="round"/><path d="M-9.5 -.5A9.5 9.5 0 0 1 9.5 -.5" fill="none" stroke="#fffbe0" stroke-width="1.6"/><path d="${seg}" stroke="#e9d65a" stroke-width=".9"/></g></g>`;
      }
    }
    if (S.mint) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const xx = cx - 30 + rs() * 60, yy = BOT - 12 - rs() * (S.muddled ? 20 : 70);
        const rot = r1(rs() * 360), fill = i % 2 ? "#5fae55" : "#3f8f45";
        s += `<g transform="translate(${r1(xx)} ${r1(yy)}) rotate(${rot})${S.muddled ? " scale(.85)" : ""}"><g${A("cs-flutter", S.mint === 2)} style="animation-delay:${i * 0.1}s" class="cs-ly" data-tip="${esc(`Yalpiz: ${S.mintAmount}`)}">`;
        s += `<path d="M0 -10C7 -6 7 5 0 11C-7 5 -7 -6 0 -10Z" fill="${S.muddled ? shade(fill, -0.2) : fill}" stroke="#2c6a31" stroke-width=".7"/><path d="M0 -9V10M0 -3l3.5 -3M0 2l-3.5 -3M0 6l3 -2.5" stroke="#2c6a31" stroke-width=".6" fill="none"/></g></g>`;
      }
    }

    // ice cubes
    if (S.ice) {
      const n = kind === "c7" ? 9 : 7;
      const ri = rng(41);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 2), col = i % 2;
        const sz = 20 + ri() * 5;
        const xx = cx + (col ? 13 : -13) + (row % 2 ? 6 : -6) + (ri() - 0.5) * 6;
        const yy = BOT - 18 - row * 23 - ri() * 4;
        const rot = r1((ri() - 0.5) * 50);
        const h = sz / 2;
        s += `<g transform="translate(${r1(xx)} ${r1(yy)}) rotate(${rot})"><g${A("cs-ice", S.ice === 2)} style="animation-delay:${i * 70}ms" class="cs-ly" data-tip="Muz">`;
        s += `<rect x="${r1(-h)}" y="${r1(-h)}" width="${r1(sz)}" height="${r1(sz)}" rx="5" fill="url(#${id}ic)" stroke="#8fc1db" stroke-width="1.1"/>`;
        s += `<rect x="${r1(-h + 4)}" y="${r1(-h + 4)}" width="${r1(sz - 8)}" height="${r1(sz - 8)}" rx="3" fill="none" stroke="#fff" stroke-opacity=".55"/>`;
        s += `<path d="M${r1(-h + 4)} ${r1(-h + 5)}h${r1(sz * 0.4)}" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g></g>`;
      }
    }

    // muddler pressing lemon + mint
    if (live && S.muddle)
      s += `<g class="cs-muddle"><rect x="${cx - 5}" y="${g.top - 70}" width="10" height="${BOT - 30 - g.top + 70}" rx="4" fill="#b98750"/><rect x="${cx - 2}" y="${g.top - 68}" width="3" height="${BOT - 34 - g.top + 70}" fill="#d7a96f"/><rect x="${cx - 9}" y="${BOT - 34}" width="18" height="14" rx="4" fill="#9c6c3a"/></g>`;

    s += `</g>`; // end clip
  } else if (kind === "cone") {
    // waffle cone
    const cone = `M${Lx} ${g.top}L${Rx} ${g.top}L${cx} ${BOT + 4}Z`;
    s += `<g${A("cs-drop", S.cup === 2)}><defs><clipPath id="${id}w"><path d="${cone}"/></clipPath><linearGradient id="${id}wf" x1="0" x2="1"><stop offset="0" stop-color="#c88a43"/><stop offset=".4" stop-color="#e7b46c"/><stop offset="1" stop-color="#b8792f"/></linearGradient></defs>`;
    s += `<path d="${cone}" fill="url(#${id}wf)"/><g clip-path="url(#${id}w)" stroke="#a8692a" stroke-width="1.3">`;
    for (let i = -6; i < 8; i++) s += `<line x1="${Lx + i * 13}" y1="${g.top}" x2="${Lx + i * 13 + 80}" y2="${BOT}"/><line x1="${Rx - i * 13}" y1="${g.top}" x2="${Rx - i * 13 - 80}" y2="${BOT}"/>`;
    s += `</g><path d="${cone}" fill="none" stroke="#9a5f22" stroke-width="1.5" stroke-linejoin="round"/><rect x="${Lx - 2}" y="${g.top - 3}" width="${g.tw + 4}" height="9" rx="4" fill="#d79c52" stroke="#9a5f22"/></g>`;
  }

  /* soft serve */
  if (sweet) {
    const sm = S.layers.find((l) => l.key === "smes");
    if (kind === "icup" && S.cup) {
      s += `<g clip-path="url(#${id}c)">`;
      for (let x = Lx + 8; x < Rx; x += 16) s += `<rect x="${x}" y="${g.top}" width="7" height="${BOT - g.top + 10}" fill="${EMBER}" opacity=".85"/>`;
      s += `<path d="${body}" fill="url(#${id}sh)"/></g>`;
    }
    if (sm) {
      const k = sm.vol > 120 ? 1.25 : 1, t = g.top - 2;
      let d = "";
      const rings = [0, 1, 2, 3];
      for (const i of rings) {
        const cy = t - (6 + i * 14) * k, rx = (g.tw / 2 + 5) * (1 - i * 0.21), ry = 9.5 * k * (1 - i * 0.08);
        d += `<g${A("cs-pop", sm.fresh)} style="animation-delay:${i * 0.28}s"><ellipse cx="${cx}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="url(#${id}ss)" stroke="#dcc7a0" stroke-width="1.2"/><path d="M${r1(cx - rx * 0.6)} ${r1(cy - ry * 0.35)}q${r1(rx * 0.3)} -4 ${r1(rx * 0.7)} -2" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/></g>`;
      }
      const ty = t - (6 + 4 * 14) * k + 6;
      d += `<g${A("cs-pop", sm.fresh)} style="animation-delay:1.12s"><path d="M${cx - 9} ${r1(ty + 6)}Q${cx - 4} ${r1(ty - 16)} ${cx + 8} ${r1(ty - 6)}Q${cx + 2} ${r1(ty - 2)} ${cx + 7} ${r1(ty + 6)}Z" fill="url(#${id}ss)" stroke="#dcc7a0" stroke-width="1.2"/></g>`;
      s += `<g class="cs-ly" data-tip="${esc(`${sm.label}: ${sm.amount}`)}">${d}</g>`;
      if (live && sm.fresh) s += source(id, "smes", COL.smes, cx, ty - 40, ty - 6);
    }
  }

  /* front of the cup */
  if (S.cup && kind !== "cone") {
    s += `<g${A("cs-drop", S.cup === 2)}>`;
    if (!sweet) s += `<path d="${body}" fill="url(#${id}sh)"/>`;
    if (g.cold) {
      s += `<path d="${edge}" fill="none" stroke="#7fa9bf" stroke-width="1.4" stroke-linejoin="round"/>`;
      s += `<path d="M${Lx + 9} ${g.top + 14}L${bl + 7} ${BOT - 12}" stroke="#fff" stroke-opacity=".7" stroke-width="4" stroke-linecap="round"/><path d="M${Rx - 10} ${g.top + 20}L${br - 8} ${BOT - 30}" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`;
      s += `<path d="M${bl + 3} ${BOT - 8}A${g.bw / 2 - 3} ${botRy} 0 0 0 ${br - 3} ${BOT - 8}" fill="none" stroke="#9cc2d6" stroke-width="1"/>`;
      s += `<ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2}" ry="${rimRy}" fill="none" stroke="#8fb8cc" stroke-width="2.2"/>`;
      // condensation
      if (S.ice || S.layers.length) {
        const rc = rng(77);
        for (let i = 0; i < 18; i++) {
          const yy = g.top + 18 + rc() * (BOT - g.top - 30), w = wAt(yy) / 2 - 6, xx = cx + (rc() - 0.5) * 2 * w;
          const rr = 1 + rc() * 1.4;
          s += `<ellipse cx="${r1(xx)}" cy="${r1(yy)}" rx="${r1(rr)}" ry="${r1(rr * 1.3)}" fill="#fff" fill-opacity=".5" stroke="#9cc2d6" stroke-opacity=".6" stroke-width=".5"/>`;
        }
        if (live)
          for (let i = 0; i < 2; i++)
            s += `<ellipse class="cs-drip" style="animation-delay:${i * 2.1}s" cx="${r1(cx - 30 + i * 52)}" cy="${g.top + 30 + i * 20}" rx="1.6" ry="2.4" fill="#fff" fill-opacity=".8" stroke="#9cc2d6" stroke-width=".5"/>`;
      }
    } else if (kind === "icup") {
      s += `<path d="${edge}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-opacity=".7" stroke-linejoin="round"/><ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2}" ry="${rimRy}" fill="none" stroke="#e8e2da" stroke-width="3"/>`;
    } else {
      s += `<path d="${body}" fill="url(#${id}kr)" opacity=".13"/><path d="${edge}" fill="none" stroke="#5b4636" stroke-width="2" stroke-opacity=".9" stroke-linejoin="round"/>`;
      s += `<ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2 + 1}" ry="${rimRy}" fill="none" stroke="#efe3d1" stroke-width="3.4"/><ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2 + 2.6}" ry="${rimRy + 1.6}" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width="1"/>`;
      // printed brand mark, faint so the layers stay readable
      const my = g.top + (BOT - g.top) * 0.36;
      s += `<g opacity=".38"><circle cx="${cx}" cy="${r1(my)}" r="12" fill="none" stroke="${EMBER}" stroke-width="1.6"/><text x="${cx}" y="${r1(my + 3.6)}" text-anchor="middle" font-size="10" font-weight="800" fill="${EMBER}" font-family="Antonio,Inter,sans-serif">CH</text></g>`;
    }
    s += `</g>`;
  }

  // tea bag string and tag hang outside
  if (S.teabag && !sweet)
    s += `<path d="M${Rx - 24} ${BOT - 58}L${Rx - 3} ${g.top - 2}L${Rx + 8} ${g.top + 10}" fill="none" stroke="#8f8577" stroke-width="1"/><rect class="cs-ly" x="${Rx + 1}" y="${g.top + 10}" width="15" height="17" rx="2" fill="${EMBER}" data-tip="Choy paketchasi: 1 dona"/><text x="${Rx + 8.5}" y="${g.top + 22}" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">CH</text>`;

  // spoon when stirring
  if (stirTop) s += `<path class="cs-spoon" d="M${cx + 4} ${r1(stirTop + 6)}L${Rx + 22} ${g.top - 52}" stroke="url(#${id}mt)" stroke-width="5" stroke-linecap="round"/>`;

  // steam above hot drinks
  if (live && hot && S.layers.length && sum(S.layers) > 40) {
    const ys = S.lid ? g.top - 22 : Math.min(surfaceY, g.top) - 6;
    const xs = S.lid ? [cx + g.tw * 0.22 - 8, cx + g.tw * 0.22 + 4] : [cx - 18, cx, cx + 18];
    xs.forEach((x, i) => {
      s += `<path class="cs-wisp" style="animation-delay:${i * 0.7}s" d="M${r1(x)} ${r1(ys)}q-7 -11 0 -22q7 -11 0 -22" fill="none" stroke="#9a8d82" stroke-opacity=".5" stroke-width="2.6" stroke-linecap="round"/>`;
    });
  }

  // lids
  if (S.lid && live) {
    const c = S.lid === 2 ? ` class="cs-drop"` : "";
    if (g.cold) {
      s += `<g${c}><path d="M${cx + 10} ${BOT - 14}L${cx + 34} ${g.top - 86}" stroke="${EMBER}" stroke-width="8" stroke-linecap="round"/><path d="M${cx + 8.5} ${BOT - 18}L${cx + 31.5} ${g.top - 84}" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`;
      s += `<path d="M${Lx - 3} ${g.top}Q${cx} ${g.top - 66} ${Rx + 3} ${g.top}Z" fill="#dcecf4" fill-opacity=".3" stroke="#7fa9bf" stroke-width="1.5"/><path d="M${Lx + 12} ${g.top - 8}Q${cx - 18} ${g.top - 44} ${cx + 6} ${g.top - 48}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>`;
      s += `<ellipse cx="${cx}" cy="${g.top}" rx="${g.tw / 2 + 3}" ry="${rimRy}" fill="none" stroke="#7fa9bf" stroke-width="2.4"/></g>`;
    } else if (!sweet) {
      s += `<g${c}><path d="M${Lx - 5} ${g.top + 1}h${g.tw + 10}v-7q0 -4 -4 -4h${-(g.tw + 2)}q-4 0 -4 4z" fill="${LID}"/>`;
      s += `<path d="M${Lx + 8} ${g.top - 10}Q${Lx + 14} ${g.top - 22} ${cx} ${g.top - 22}Q${Rx - 14} ${g.top - 22} ${Rx - 8} ${g.top - 10}Z" fill="#3a3330"/>`;
      s += `<ellipse cx="${r1(cx + g.tw * 0.22)}" cy="${g.top - 16}" rx="5" ry="2" fill="#0d0b0a"/><path d="M${Lx + 16} ${g.top - 13}Q${cx - 20} ${g.top - 20} ${cx - 4} ${g.top - 20}" stroke="#fff" stroke-opacity=".22" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
    }
  }

  /* what is being added on this step, and from where */
  if (live) {
    if (S.src?.to === "cup" && !sweet) s += source(id, S.src.key, S.src.col, cx, g.top - 8, surfaceY + 4);
    if (S.pourFx) {
      const px = cx + 16, py = Math.max(34, g.top - 30);
      const jug = S.pourFx.from === "pitcher";
      const shape = jug
        ? `<path d="M0 0L6 6H44L50 62H-6Z" fill="url(#${id}mt)" stroke="#6d757b" stroke-width="1.2"/><path d="M48 16q20 6 4 34" fill="none" stroke="#8d9399" stroke-width="5" stroke-linecap="round"/>`
        : `<path d="M0 0L4 8H50L42 66H12Z" fill="#dcecf4" fill-opacity=".6" stroke="#7fa9bf" stroke-width="1.4"/><path d="M8 40H46L42 66H12Z" fill="${S.pourFx.col}"/><rect x="2" y="-4" width="50" height="9" rx="3" fill="${LID}" opacity="0"/>`;
      s += `<g class="cs-src2"><g transform="translate(${px} ${py}) rotate(-100)"><g><animateTransform attributeName="transform" type="rotate" from="60" to="0" dur=".55s" fill="freeze"/>${shape}</g></g>`;
      s += stream(px, py, cx, surfaceY + 6, S.pourFx.col, jug ? 7 : 9, "cs-stream", true) + `</g>`;
    }
  }

  /* side station: grinder, pitcher, blender */
  if (live) {
    const sx = SX;
    if (S.grind) {
      // grinder doses into the holder, then the tamper presses
      let gr = `<g class="cs-gout"><path d="M${sx - 22} 62H${sx + 22}L${sx + 12} 102H${sx - 12}Z" fill="#dcecf4" fill-opacity=".55" stroke="#7fa9bf" stroke-width="1.2"/>`;
      const rb = rng(3);
      for (let i = 0; i < 16; i++) gr += `<ellipse cx="${r1(sx - 13 + rb() * 26)}" cy="${r1(74 + rb() * 24)}" rx="3" ry="2" fill="#4a2a18" transform="rotate(${Math.round(rb() * 180)} ${r1(sx)} ${80})"/>`;
      gr += `<rect x="${sx - 21}" y="102" width="42" height="64" rx="7" fill="${LID}"/><rect x="${sx - 15}" y="110" width="4" height="48" rx="2" fill="#fff" opacity=".12"/><circle cx="${sx + 8}" cy="124" r="6" fill="url(#${id}mt)"/>`;
      gr += `<rect x="${sx - 6}" y="166" width="12" height="12" fill="url(#${id}mt)"/>`;
      for (let i = 0; i < 10; i++) gr += `<circle class="cs-fall" style="--fy:20px;animation-delay:${(i * 0.08).toFixed(2)}s" cx="${sx - 3 + (i % 3) * 3}" cy="180" r="1.3" fill="#5a3320"/>`;
      s += gr + `</g>`;
      s += `<g class="cs-in"><path d="M${sx + 22} 207L${sx + 60} 214" stroke="#1d1a18" stroke-width="9" stroke-linecap="round"/><path d="M${sx - 24} 200h48l-4 14h-40z" fill="url(#${id}mt)" stroke="#6d757b"/>`;
      s += `<ellipse class="cs-mound" cx="${sx}" cy="200" rx="20" ry="6" fill="${COL.kofe}"/></g>`;
      s += `<g class="cs-tamp"><rect x="${sx - 6}" y="160" width="12" height="26" rx="5" fill="#9c6c3a"/><rect x="${sx - 19}" y="186" width="38" height="9" rx="2" fill="url(#${id}mt)" stroke="#6d757b"/></g>`;
      s += `<text x="${sx}" y="48" text-anchor="middle" font-size="15" font-weight="700" fill="${EMBER}">${esc(S.grind)}</text>`;
      s += `<text x="${sx}" y="278" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}" fill-opacity=".55">portafiltr (xolder)</text>`;
    }
    if (S.side) {
      const isB = S.side.type === "blender";
      const sg = isB ? { top: 100, bot: 206, tw: 72, bw: 50, cap: 900 } : { top: 166, bot: 250, tw: 50, bw: 64, cap: 600 };
      const id2 = id + "s";
      const p = `${sx - sg.tw / 2},${sg.top} ${sx + sg.tw / 2},${sg.top} ${sx + sg.bw / 2},${sg.bot} ${sx - sg.bw / 2},${sg.bot}`;
      const tot = sum(S.side.layers);
      const hasIce = S.side.layers.some((l) => l.key === "muz");
      const ls: Layer[] = S.side.mixed
        ? [{ key: "mix", label: isB ? "Aralashma" : "Bug‘langan aralashma", vol: tot, amount: `≈ ${Math.round(tot)} ml`, col: mix(S.side.layers), fresh: false }]
        : S.side.layers;
      const H = sg.bot - sg.top - 6, sc = Math.min(1, (0.9 * sg.cap) / Math.max(tot, 1));
      let y = sg.bot;
      let inner2 = "";
      for (const l of ls) {
        const h = Math.max(3, (l.vol / sg.cap) * H * sc);
        y -= h;
        let b = `<rect x="${sx - 40}" y="${r1(y)}" width="80" height="${r1(h + 0.8)}" fill="${l.col}"${l.key === "muz" ? ` fill-opacity=".35"` : ""}/>`;
        if (l.key === "muz") {
          for (let k = 0; k < Math.max(2, Math.round(h / 12)) * 3; k++) {
            const xx = sx - 18 + (k % 3) * 14, yy = y + 6 + Math.floor(k / 3) * 12;
            if (yy < y + h - 4) b += `<rect x="${xx - 6}" y="${r1(yy - 5)}" width="12" height="12" rx="3" fill="url(#${id}ic)" stroke="#8fc1db" transform="rotate(${(k * 37) % 60 - 30} ${xx} ${r1(yy)})"/>`;
          }
        }
        if (S.side.mixed && hasIce) {
          const rr = rng(9);
          for (let k = 0; k < 26; k++) b += `<circle cx="${r1(sx + (rr() - 0.5) * 60)}" cy="${r1(y + rr() * h)}" r="${r1(0.8 + rr())}" fill="#fff" fill-opacity=".8"/>`;
        }
        inner2 += `<g class="cs-ly${l.fresh ? (l.key === "muz" ? " cs-fadein" : " cs-pour") : ""}${S.blend ? " cs-wob" : ""}" data-tip="${esc(`${l.label}: ${l.amount}`)}">${b}</g>`;
      }
      const sideTop = y;
      let side = `<defs><clipPath id="${id2}"><polygon points="${p}"/></clipPath></defs>`;
      side += `<polygon points="${p}" fill="${isB ? "#dcecf4" : "url(#" + id + "mt)"}" opacity="${isB ? 0.55 : 0.35}"/>`;
      side += `<g clip-path="url(#${id2})"><g filter="url(#${id}bl)">${inner2}</g>`;
      if ((S.blend || S.steam) && ls.length) {
        const vy = (sideTop + sg.bot) / 2;
        for (let k = 0; k < 3; k++)
          side += `<ellipse class="cs-spin" style="animation-delay:-${k * 0.2}s" cx="${sx}" cy="${r1(vy + (k - 1) * 14)}" rx="${18 - k * 3}" ry="5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="10 7"/>`;
      }
      if (isB) side += `<path d="M${sx - 14} ${sg.bot - 6}L${sx + 14} ${sg.bot - 10}M${sx - 14} ${sg.bot - 10}L${sx + 14} ${sg.bot - 6}" stroke="#7d848a" stroke-width="2.5"${S.blend ? ` class="cs-spin"` : ""}/>`;
      side += `<rect x="${sx - 40}" y="${sg.top}" width="80" height="${sg.bot - sg.top}" fill="url(#${id}sh)" opacity=".7"/></g>`;
      side += `<polygon points="${p}" fill="none" stroke="${isB ? "#7fa9bf" : "#6d757b"}" stroke-width="1.8" stroke-linejoin="round"/>`;
      if (isB) {
        side += `<path d="M${sx - sg.tw / 2 + 6} ${sg.top + 8}L${sx - sg.bw / 2 + 5} ${sg.bot - 8}" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`;
        side += `<path d="M${sx + sg.tw / 2} ${sg.top + 12}h10v52h-6" fill="none" stroke="#7fa9bf" stroke-width="4"/>`;
        if (S.blend) side += `<rect x="${sx - sg.tw / 2 - 3}" y="${sg.top - 9}" width="${sg.tw + 6}" height="10" rx="3" fill="${LID}"/>`;
        side += `<g${S.blend ? ` class="cs-shake"` : ""}><path d="M${sx - 34} 206h68l4 44h-76z" fill="${LID}"/><rect x="${sx - 30}" y="210" width="60" height="4" fill="#4a403b"/><circle cx="${sx}" cy="231" r="7" fill="url(#${id}mt)"/><circle cx="${sx}" cy="231" r="2.5" fill="${S.blend ? "#e46a4f" : EMBER}"/></g>`;
      } else {
        side += `<path d="M${sx - sg.tw / 2} ${sg.top}l-12 -7l6 16z" fill="url(#${id}mt)" stroke="#6d757b" stroke-width="1.5" stroke-linejoin="round"/><path d="M${sx + sg.tw / 2 + 3} ${sg.top + 14}q26 10 6 50" fill="none" stroke="#8d9399" stroke-width="5" stroke-linecap="round"/>`;
        side += `<ellipse cx="${sx}" cy="${sg.top}" rx="${sg.tw / 2}" ry="3.5" fill="none" stroke="#6d757b" stroke-width="1.4"/>`;
      }
      s += `<g${S.steam ? ` class="cs-buzz"` : ""}>${side}</g>`;

      // what's being added to the side jar
      if (S.src && S.src.to !== "cup" && !S.steam && !S.blend) s += source(id, S.src.key, S.src.col, sx, sg.top - 6, sideTop + 2);

      if (S.steam) {
        // steam wand, thermometer with a sweeping needle, wisps
        s += `<path d="M${sx - 52} ${sg.top - 70}L${sx - 30} ${sg.top - 50}L${sx - 6} ${sg.bot - 24}" fill="none" stroke="url(#${id}mt)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${sx - 6}" cy="${sg.bot - 24}" r="2" fill="#6d757b"/>`;
        const tx = sx + 16, ty = sg.top - 22;
        s += `<line x1="${tx}" y1="${ty + 10}" x2="${tx - 2}" y2="${sg.top + 40}" stroke="#6d757b" stroke-width="2"/><circle cx="${tx}" cy="${ty}" r="12" fill="#fff" stroke="#6d757b" stroke-width="2"/><path d="M${tx - 8} ${ty + 6}A10 10 0 1 1 ${tx + 8} ${ty + 6}" fill="none" stroke="#e8b3a6" stroke-width="2.5"/>`;
        s += `<g><animateTransform attributeName="transform" type="rotate" from="-120 ${tx} ${ty}" to="${S.steamTemp.includes("80") ? 95 : 60} ${tx} ${ty}" dur="1.8s" fill="freeze"/><line x1="${tx}" y1="${ty}" x2="${tx}" y2="${ty - 9}" stroke="#b3412f" stroke-width="2" stroke-linecap="round"/></g><circle cx="${tx}" cy="${ty}" r="2" fill="${INK}"/>`;
        for (let i = 0; i < 3; i++)
          s += `<path class="cs-wisp" style="animation-delay:${i * 0.5}s" d="M${sx - 18 + i * 12} ${sg.top - 10}q-6 -10 0 -20q6 -10 0 -20" fill="none" stroke="#9a8d82" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>`;
        s += `<text x="${sx - 2}" y="${sg.top - 50}" text-anchor="middle" font-size="15" font-weight="800" fill="#b3412f">${esc(S.steamTemp)}</text>`;
      }
      s += `<text x="${sx}" y="278" text-anchor="middle" font-size="13" font-weight="600" fill="${INK}" fill-opacity=".55">${isB ? "blender" : "pitcher"}</text>`;
    }
  }
  return s + "</svg>";
}

/** The picture as a React element. Tapping a layer calls onTip with "Sut: 280 ml". */
export function CupPicture({
  size,
  upto,
  mini,
  crop,
  onTip,
  className = "",
}: {
  size: RecipeSize;
  upto: number;
  mini?: boolean;
  crop?: boolean; // trim the empty space above the cup (single picture, not a size comparison)
  onTip?: (tip: string) => void;
  className?: string;
}) {
  const full = useMemo(() => fullVolume(size), [size]);
  const html = useMemo(() => {
    const S = applyScene(size, upto);
    if (mini) {
      S.lid = 0;
      S.layers.forEach((l) => (l.fresh = false));
    }
    return sceneSvg(size.cupKind ?? "m", S, { mini, full, crop });
  }, [size, upto, mini, full, crop]);
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!onTip) return;
    const t = (e.target as Element).closest("[data-tip]");
    if (t) onTip(t.getAttribute("data-tip") || "");
  };
  return <div className={`cup-scene ${className}`} onClick={click} dangerouslySetInnerHTML={{ __html: html }} />;
}
