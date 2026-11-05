import { useMemo, type MouseEvent } from "react";
import type { CupKind, RecipeSize, SceneLayer } from "@/shared/types";

/**
 * Cutaway picture of a drink being built. The server sends, for every step,
 * what that step does (RecipeSize.scene); here we replay the steps up to the
 * current one and draw the cup, pitcher/blender, layers, ice, lid…
 * Layers are drawn to scale against the cup's volume. Tap a layer → onTip(label).
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
const KRAFT = "#c9a57a";
const GLASS = "#9fc3d6";
const STEEL = "#b9bec2";
const LID = "#2b2522";
const EMBER = "#71292A";

type Layer = SceneLayer & { col: string; fresh: boolean; foam?: boolean; stir?: boolean };
type Side = { type: "pitcher" | "blender"; layers: Layer[]; mixed: boolean };
type Flag = 0 | 1 | 2; // 0 none · 1 present · 2 appeared on this step (animate)
export interface SceneState {
  cup: Flag;
  layers: Layer[];
  side: Side | null;
  ice: Flag;
  slices: Flag;
  slicesAmount: string;
  teabag: Flag;
  lid: Flag;
  grind: string | null;
  steam: boolean;
  blend: boolean;
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(ls: { vol: number; col: string }[]) {
  let t = 0;
  let a = [0, 0, 0];
  for (const l of ls) {
    const w = Math.max(l.vol, 1);
    const h = hex(l.col);
    t += w;
    a = a.map((v, i) => v + h[i] * w);
  }
  return "#" + a.map((v) => Math.round(v / t).toString(16).padStart(2, "0")).join("");
}
const sum = (ls: { vol: number }[]) => ls.reduce((a, l) => a + l.vol, 0);

/** Replays steps 0..upto (upto = -1 → nothing done yet). */
export function applyScene(size: RecipeSize, upto: number): SceneState {
  const S: SceneState = {
    cup: 0, layers: [], side: null, ice: 0, slices: 0, slicesAmount: "", teabag: 0,
    lid: 0, grind: null, steam: false, blend: false,
  };
  const scene = size.scene ?? [];
  for (let i = 0; i <= upto && i < scene.length; i++) {
    const fr = i === upto;
    const f: Flag = fr ? 2 : 1;
    S.grind = null;
    S.steam = false;
    S.blend = false;
    S.layers.forEach((l) => (l.stir = false));
    for (const o of scene[i]) {
      switch (o.op) {
        case "cup": S.cup = f; break;
        case "grind": S.grind = fr ? o.amount : null; break;
        case "add": {
          const l: Layer = { ...o.layer, col: COL[o.layer.key] ?? "#cccccc", fresh: fr };
          if (o.to === "cup") S.layers.push(l);
          else {
            if (!S.side) S.side = { type: o.to, layers: [], mixed: false };
            S.side.layers.push(l);
          }
          break;
        }
        case "steam":
        case "blend":
          if (S.side) S.side.mixed = true;
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
          S.side = null;
          break;
        }
        case "stir": {
          const t = sum(S.layers);
          S.layers = [{ key: "mix", label: o.label, vol: t, amount: `≈ ${Math.round(t)} ml`, col: mix(S.layers), fresh: false, stir: fr }];
          break;
        }
        case "ice": S.ice = f; break;
        case "slices": S.slices = f; S.slicesAmount = o.amount; break;
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
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
let uid = 0;

/** Total cup volume of the finished drink — keeps the scale the same on every step. */
export function fullVolume(size: RecipeSize) {
  return sum(applyScene(size, (size.scene?.length ?? 0) - 1).layers);
}

export function sceneSvg(kind: CupKind, S: SceneState, o: { mini?: boolean; full?: number; crop?: boolean } = {}): string {
  const mini = !!o.mini;
  const g = GEO[kind];
  const W = mini ? 150 : 300;
  const cx = mini ? 75 : 112;
  const id = "cs" + ++uid;
  const Lx = cx - g.tw / 2, Rx = cx + g.tw / 2, bl = cx - g.bw / 2, br = cx + g.bw / 2, cap = CAP[kind];
  const poly = `${Lx},${g.top} ${Rx},${g.top} ${br},${BOT} ${bl},${BOT}`;
  const inner = `${Lx + 3},${g.top + 1} ${Rx - 3},${g.top + 1} ${br - 3},${BOT - 3} ${bl + 3},${BOT - 3}`;
  const sweet = kind === "cone" || kind === "icup";
  const anim = (c: string, on: boolean) => (on && !mini ? ` class="${c}"` : "");
  const y0 = o.crop ? Math.max(0, g.top - 90) : 0;
  let s = `<svg viewBox="0 ${y0} ${W} ${290 - y0 - (mini ? 30 : 0)}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${id}"><polygon points="${inner}"/></clipPath></defs>`;

  if (!S.cup) s += `<polygon points="${poly}" fill="none" stroke="${INK}" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  else {
    s += `<g${anim("cs-drop", S.cup === 2)}>`;
    if (kind === "cone") {
      s += `<polygon points="${poly}" fill="#d9a35b" stroke="#a8742f" stroke-width="2"/>`;
      for (let i = 1; i < 6; i++)
        s += `<line x1="${Lx + i * 15}" y1="${g.top}" x2="${cx - 8 + i * 3}" y2="${BOT - 8}" stroke="#a8742f" clip-path="url(#${id})"/><line x1="${Lx}" y1="${g.top + i * 14}" x2="${Rx}" y2="${g.top + i * 14 + 10}" stroke="#a8742f" clip-path="url(#${id})"/>`;
    } else s += `<polygon points="${poly}" fill="${g.cold ? GLASS : KRAFT}" opacity="${g.cold ? 0.18 : 0.3}"/>`;
    s += `</g>`;
  }

  let stream = "";
  if (!sweet) {
    const H = BOT - 3 - (g.top + 6);
    const sc = Math.min(1, (0.94 * cap) / Math.max(o.full || sum(S.layers), 1));
    let y = BOT - 3;
    s += `<g clip-path="url(#${id})">`;
    S.layers.forEach((l, i) => {
      const h = Math.max(3, (l.vol / cap) * H * sc);
      y -= h;
      let body = `<rect x="${Lx}" y="${y}" width="${g.tw}" height="${h + 0.6}" fill="${l.col}"/>`;
      if (l.foam) for (let xx = Lx + 6; xx < Rx; xx += 9) body += `<circle cx="${xx}" cy="${y + 3}" r="2.2" fill="#e8dccb"/>`;
      if (l.key === "kofe" && i === S.layers.length - 1) body += `<rect x="${Lx}" y="${y}" width="${g.tw}" height="${Math.min(4, h)}" fill="#a8703f"/>`;
      const cls = ["cs-ly", l.fresh && !mini ? "cs-pour" : "", l.stir && !mini ? "cs-wob" : ""].join(" ").trim();
      s += `<g class="${cls}" data-tip="${esc(`${l.label}: ${l.amount}`)}">${body}</g>`;
      if (l.fresh && !mini)
        stream = `<rect class="cs-stream" x="${cx - 3}" y="${g.top - 60}" width="6" height="${y - g.top + 60}" rx="3" fill="${l.col}" stroke="${INK}" stroke-opacity=".15" stroke-width=".5"/>`;
    });
    if (S.ice) {
      const n = kind === "c7" ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / 2), col = i % 2;
        const xx = cx - 26 + col * 28 + (row % 2 ? 8 : -4), yy = BOT - 30 - row * 26;
        s += `<g transform="rotate(${i % 3 ? 12 : -10} ${xx + 11} ${yy + 11})"><rect${anim("cs-drop", S.ice === 2)} style="animation-delay:${i * 60}ms" x="${xx}" y="${yy}" width="22" height="22" rx="4" fill="#e1f2fc" fill-opacity=".55" stroke="#8cb9d2" stroke-width="1.2" data-tip="Muz"/></g>`;
      }
    }
    if (S.slices)
      for (let i = 0; i < 3; i++) {
        const xx = cx - 22 + i * 22, yy = BOT - 16 - (i % 2) * 10;
        s += `<g class="cs-ly${S.slices === 2 && !mini ? " cs-drop" : ""}" data-tip="${esc(`Limon: ${S.slicesAmount}`)}"><circle cx="${xx}" cy="${yy}" r="11" fill="#f3e46a" stroke="#c9b52a" stroke-width="2"/><path d="M${xx - 8} ${yy}h16M${xx} ${yy - 8}v16M${xx - 6} ${yy - 6}l12 12M${xx + 6} ${yy - 6}l-12 12" stroke="#c9b52a" stroke-width="1"/></g>`;
      }
    if (S.teabag) s += `<rect x="${Rx - 34}" y="${BOT - 60}" width="20" height="26" rx="3" fill="#d9c49a" stroke="#a88f5c"/>`;
    s += `</g>`;
  } else {
    const sm = S.layers.find((l) => l.key === "smes");
    if (sm) {
      const h = sm.vol > 120 ? 70 : 54, t = g.top;
      const e = `fill="${COL.smes}" stroke="#e0cfae" stroke-width="1.5"`;
      s += `<g class="cs-ly${sm.fresh && !mini ? " cs-pour" : ""}" data-tip="${esc(`${sm.label}: ${sm.amount}`)}"><ellipse cx="${cx}" cy="${t - h * 0.15}" rx="${g.tw / 2 + 2}" ry="${h * 0.28}" ${e}/><ellipse cx="${cx}" cy="${t - h * 0.5}" rx="${g.tw * 0.36}" ry="${h * 0.24}" ${e}/><path d="M${cx - g.tw * 0.22} ${t - h * 0.62} Q${cx} ${t - h * 1.25} ${cx + g.tw * 0.22} ${t - h * 0.62}Z" ${e}/></g>`;
    }
  }

  if (S.cup && kind !== "cone")
    s += `<polygon points="${poly}" fill="none" stroke="${INK}" stroke-width="${g.cold ? 1.6 : 2.2}" stroke-opacity="${g.cold ? 0.6 : 1}" stroke-linejoin="round"/>`;
  if (S.cup && g.cold) s += `<line x1="${Lx + 10}" y1="${g.top + 14}" x2="${bl + 8}" y2="${BOT - 14}" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`;
  if (S.teabag)
    s += `<path d="M${Rx - 24} ${BOT - 60}L${Rx + 8} ${g.top - 14}" stroke="${INK}" stroke-opacity=".5"/><rect class="cs-ly" x="${Rx}" y="${g.top - 30}" width="18" height="18" rx="2" fill="${EMBER}" data-tip="Choy paketchasi: 1 dona"/>`;
  s += stream;

  if (S.lid && !mini) {
    const c = S.lid === 2 ? ` class="cs-drop"` : "";
    if (g.cold)
      s += `<g${c}><path d="M${Lx - 3} ${g.top}Q${cx} ${g.top - 64} ${Rx + 3} ${g.top}Z" fill="${GLASS}" fill-opacity=".22" stroke="${INK}" stroke-opacity=".5" stroke-width="1.5"/><line x1="${cx + 12}" y1="${BOT - 16}" x2="${cx + 30}" y2="${g.top - 80}" stroke="${EMBER}" stroke-width="7" stroke-linecap="round" opacity=".9"/></g>`;
    else if (!sweet)
      s += `<g${c}><rect x="${Lx - 5}" y="${g.top - 9}" width="${g.tw + 10}" height="10" rx="3" fill="${LID}"/><rect x="${Lx + 8}" y="${g.top - 18}" width="${g.tw - 16}" height="11" rx="5" fill="${LID}"/></g>`;
  }

  if (!mini) {
    const sx = 238;
    if (S.grind)
      s += `<g class="cs-drop"><text x="${sx}" y="186" text-anchor="middle" font-size="14" font-weight="600" fill="${INK}">${esc(S.grind)}</text><rect x="${sx + 24}" y="208" width="40" height="9" rx="4" fill="${LID}"/><ellipse cx="${sx}" cy="212" rx="30" ry="11" fill="${STEEL}" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${sx}" cy="209" rx="23" ry="6" fill="${COL.kofe}"/></g>`;
    if (S.side) {
      const isB = S.side.type === "blender";
      const sg = isB ? { top: 108, bot: 212, tw: 66, bw: 48, cap: 900 } : { top: 166, bot: 250, tw: 50, bw: 64, cap: 600 };
      const id2 = id + "s";
      const p = `${sx - sg.tw / 2},${sg.top} ${sx + sg.tw / 2},${sg.top} ${sx + sg.bw / 2},${sg.bot} ${sx - sg.bw / 2},${sg.bot}`;
      s += `<defs><clipPath id="${id2}"><polygon points="${p}"/></clipPath></defs><polygon points="${p}" fill="${isB ? GLASS : STEEL}" opacity=".3"/>`;
      const tot = sum(S.side.layers);
      const ls: Layer[] = S.side.mixed
        ? [{ key: "mix", label: isB ? "Aralashma" : "Bug‘langan aralashma", vol: tot, amount: `≈ ${Math.round(tot)} ml`, col: mix(S.side.layers), fresh: false }]
        : S.side.layers;
      const H = sg.bot - sg.top - 6, sc = Math.min(1, (0.9 * sg.cap) / Math.max(tot, 1));
      let y = sg.bot, st2 = "";
      s += `<g clip-path="url(#${id2})">`;
      for (const l of ls) {
        const h = Math.max(3, (l.vol / sg.cap) * H * sc);
        y -= h;
        s += `<g class="cs-ly${l.fresh ? " cs-pour" : ""}${S.blend ? " cs-wob" : ""}" data-tip="${esc(`${l.label}: ${l.amount}`)}"><rect x="${sx - 40}" y="${y}" width="80" height="${h + 0.6}" fill="${l.col}"/></g>`;
        if (l.fresh) st2 = `<rect class="cs-stream" x="${sx - 3}" y="${sg.top - 50}" width="6" height="${y - sg.top + 50}" rx="3" fill="${l.col}"/>`;
      }
      s += `</g><polygon points="${p}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>${st2}`;
      if (isB) s += `<rect x="${sx - 32}" y="212" width="64" height="38" rx="6" fill="${LID}"/><circle cx="${sx}" cy="231" r="6" fill="${EMBER}"/>`;
      else
        s += `<path d="M${sx - sg.tw / 2} ${sg.top}l-11 -7l5 15z" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M${sx + sg.tw / 2 + 2} ${sg.top + 14}q24 10 6 50" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
      if (S.steam) {
        for (let i = 0; i < 3; i++)
          s += `<path class="cs-wisp" style="animation-delay:${i * 0.5}s" d="M${sx - 14 + i * 14} ${sg.top - 12}q-6 -10 0 -20q6 -10 0 -20" fill="none" stroke="${INK}" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`;
        s += `<text x="${sx}" y="${sg.top - 62}" text-anchor="middle" font-size="14" font-weight="700" fill="#b3412f">60–65 °C</text>`;
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
