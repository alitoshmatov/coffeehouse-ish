import { useCallback, useEffect, useRef, useState } from "react";
import { haptic, tg } from "@/lib/telegram";

/**
 * Gamification for the recipe course: XP, barista levels, a daily streak and badges.
 * Everything is kept on this phone (localStorage), like the "Bilaman" marks.
 */

export interface GameState {
  xp: number;
  streak: number; // days in a row with any learning
  lastDay: string; // YYYY-MM-DD of the last learning day
  badges: string[];
  watched: string[]; // drinks whose steps were watched to the end (XP once per drink)
  bestCombo: number;
}

export const LEVELS = [
  { min: 0, name: "Shogird" },
  { min: 100, name: "Yordamchi" },
  { min: 250, name: "Barista" },
  { min: 500, name: "Katta barista" },
  { min: 900, name: "Usta barista" },
];

export function levelOf(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1];
  return {
    n: i + 1,
    name: LEVELS[i].name,
    next: next?.min ?? null,
    progress: next ? (xp - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1,
  };
}

/** Fixed badges. Category badges ("cat:<id>") are added from the recipe book. */
export const BADGES: Record<string, { name: string; desc: string }> = {
  first: { name: "Birinchi retsept", desc: "Bitta ichimlikni oxirigacha ko‘ring" },
  perfect: { name: "Mukammal", desc: "Mashqda hamma savolga to‘g‘ri javob bering" },
  combo5: { name: "Olovli seriya", desc: "Ketma-ket 5 ta to‘g‘ri javob" },
  streak3: { name: "3 kun ketma-ket", desc: "3 kun ketma-ket o‘rganing" },
  all: { name: "Menyu ustasi", desc: "Hamma ichimliklarni o‘rganing" },
};

export const XP = { watch: 10, learn: 25, correct: 10, comboBonus: 5, perfect: 50 };

export type Toast = { id: number; kind: "xp" | "badge" | "level"; text: string; sub?: string };

const EMPTY: GameState = { xp: 0, streak: 0, lastDay: "", badges: [], watched: [], bestCombo: 0 };
const key = () => `ch-game-${tg?.initDataUnsafe.user?.id ?? "x"}`;
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function load(): GameState {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(key()) || "{}") };
  } catch {
    return { ...EMPTY };
  }
}

export function useGame(badgeName: (id: string) => string) {
  const [g, setG] = useState<GameState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [party, setParty] = useState(0); // confetti trigger
  const ref = useRef(g);
  ref.current = g;
  const tid = useRef(0);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++tid.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === "xp" ? 1400 : 2200);
  }, []);

  const save = useCallback((next: GameState) => {
    ref.current = next;
    setG(next);
    try {
      localStorage.setItem(key(), JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in memory */
    }
  }, []);

  /** Apply a change; handles the daily streak, level-ups and new badges. */
  const update = useCallback(
    (fn: (s: GameState) => GameState, xp = 0, why = "") => {
      const prev = ref.current;
      let next = fn({ ...prev, badges: [...prev.badges], watched: [...prev.watched] });
      const today = day();
      if (next.lastDay !== today) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        next.streak = next.lastDay === day(y) ? next.streak + 1 : 1;
        next.lastDay = today;
        if (next.streak >= 3 && !next.badges.includes("streak3")) next.badges.push("streak3");
      }
      next = { ...next, xp: next.xp + xp };
      save(next);
      if (xp > 0) toast({ kind: "xp", text: `+${xp} XP`, sub: why });
      for (const b of next.badges.filter((b) => !prev.badges.includes(b))) {
        toast({ kind: "badge", text: badgeName(b), sub: "Yangi nishon!" });
        haptic("success");
        setParty((p) => p + 1);
      }
      const L0 = levelOf(prev.xp), L1 = levelOf(next.xp);
      if (L1.n > L0.n) {
        toast({ kind: "level", text: L1.name, sub: `${L1.n}-daraja ochildi` });
        haptic("success");
        setParty((p) => p + 1);
      }
    },
    [save, toast, badgeName],
  );

  const award = useCallback((xp: number, why: string) => update((s) => s, xp, why), [update]);
  const unlock = useCallback((...ids: string[]) => update((s) => ({ ...s, badges: [...new Set([...s.badges, ...ids])] })), [update]);

  // keep the streak honest when the course is opened on a new day (no XP, just the flame)
  useEffect(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (g.lastDay && g.lastDay !== day() && g.lastDay !== day(y) && g.streak) save({ ...g, streak: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { g, toasts, party, update, award, unlock };
}
