import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, GraduationCap, Lightbulb, Loader2, Pause, Play, RotateCcw, TriangleAlert, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { haptic, tg } from "@/lib/telegram";
import type { RecipeBook, RecipeItem, RecipeSize } from "@/shared/types";
import { BottomBar } from "./BottomBar";
import { CupPicture } from "./CupScene";

/**
 * Recipe course for trial baristas: golden rules, every drink with its sizes,
 * ingredients and numbered steps (with an animated cup picture that fills step by step), and a quiz. "Bilaman" marks are kept on this phone.
 */

type View = { k: "home" } | { k: "item"; id: string } | { k: "quiz" };

const storeKey = () => `ch-learned-${tg?.initDataUnsafe.user?.id ?? "x"}`;
function loadLearned(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storeKey()) || "[]"));
  } catch {
    return new Set();
  }
}

export function LearnView({ onExit }: { onExit: () => void }) {
  const [book, setBook] = useState<RecipeBook | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>({ k: "home" });
  const [learned, setLearned] = useState<Set<string>>(loadLearned);

  const load = useCallback(async () => {
    setError("");
    try {
      setBook(await api<RecipeBook>("/api/recipes"));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  // Telegram back button: inner screens → course home → status screen
  useEffect(() => {
    if (!tg) return;
    const back = () => (view.k === "home" ? onExit() : go({ k: "home" }));
    tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg?.BackButton.offClick(back);
  }, [view, onExit]);

  const toggle = (id: string) => {
    const next = new Set(learned);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      haptic("success");
    }
    setLearned(next);
    try {
      localStorage.setItem(storeKey(), JSON.stringify([...next]));
    } catch {
      /* storage unavailable — keep in memory */
    }
  };

  const items = useMemo(() => book?.categories.flatMap((c) => c.items.map((it) => ({ ...it, cat: c.title }))) ?? [], [book]);

  if (error)
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <TriangleAlert className="w-10 h-10 text-ember" aria-hidden />
        <p className="mt-4 max-w-xs text-bean/75">{error}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={onExit} className="btn-ghost">Orqaga</button>
          <button onClick={load} className="btn-primary">Qayta urinish</button>
        </div>
      </main>
    );
  if (!book)
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-ember" aria-label="Yuklanmoqda" />
      </main>
    );

  if (view.k === "item") {
    const i = items.findIndex((it) => it.id === view.id);
    const it = items[i];
    if (it)
      return (
        <DrinkView
          key={it.id}
          item={it}
          category={it.cat}
          learned={learned.has(it.id)}
          onToggle={() => toggle(it.id)}
          onNext={i < items.length - 1 ? () => go({ k: "item", id: items[i + 1].id }) : undefined}
          onHome={() => go({ k: "home" })}
        />
      );
  }
  if (view.k === "quiz") return <Quiz book={book} onHome={() => go({ k: "home" })} />;

  const done = items.filter((it) => learned.has(it.id)).length;
  return (
    <main className="pb-28">
      <header className="bg-ember text-foam px-5 pt-8 pb-7">
        <p className="inline-flex items-center gap-2 rounded-full border border-foam/25 px-3 py-1 text-xs">
          <GraduationCap className="w-3.5 h-3.5" aria-hidden /> Sinov muddati · o‘quv
        </p>
        <h1 className="mt-4 font-poster uppercase font-bold leading-[0.95] text-[2.6rem]">Retseptlarni o‘rganamiz</h1>
        <p className="mt-3 text-foam/80 leading-relaxed">Avval oltin qoidalarni yodlang, keyin har bir ichimlikni qadamma-qadam o‘rganing va mashq bilan tekshiring.</p>
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span className="text-foam/80">O‘rganildi</span>
            <span className="font-semibold tabular-nums">
              {done} / {items.length}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-foam/15 overflow-hidden">
            <div className="h-full bg-rose rounded-full transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
        </div>
      </header>

      <section className="px-5 pt-7">
        <h2 className="font-poster uppercase text-2xl font-bold">Oltin qoidalar</h2>
        <p className="text-sm text-bean/60">Shularni bilsangiz, menyuning yarmini bilasiz</p>
        <ul className="mt-4 grid gap-3">
          {book.rules.map((r, n) => (
            <li key={r.title} className="card p-4 flex gap-3">
              <span className="w-7 h-7 shrink-0 rounded-full bg-foam text-ember font-semibold text-sm flex items-center justify-center tabular-nums">{n + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm text-bean/60">{r.title}</span>
                <span className="block font-poster text-xl font-semibold text-ember leading-tight">{r.big}</span>
                <span className="block mt-1 text-sm text-bean/75 leading-relaxed">{r.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {book.categories.map((c) => (
        <section key={c.id} className="px-5 pt-7">
          <h2 className="font-poster uppercase text-2xl font-bold">{c.title}</h2>
          {c.note && <p className="text-sm text-bean/60">{c.note}</p>}
          <ul className="mt-3 card divide-y divide-line">
            {c.items.map((it) => (
              <li key={it.id}>
                <button onClick={() => go({ k: "item", id: it.id })} className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
                  <span
                    className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center ${learned.has(it.id) ? "border-emerald-600 bg-emerald-600 text-white" : "border-line"}`}
                    aria-label={learned.has(it.id) ? "O‘rganilgan" : undefined}
                  >
                    {learned.has(it.id) && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.name}</span>
                    <span className="block text-sm text-bean/55">{it.sizes.map((s) => s.size).join(" · ")}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-bean/40" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <BottomBar>
        <button onClick={() => go({ k: "quiz" })} className="btn-primary w-full">
          <GraduationCap className="w-5 h-5" aria-hidden /> Mashq qilish
        </button>
      </BottomBar>
    </main>
  );
}

/* ───────────── one drink ───────────── */

function DrinkView({
  item,
  category,
  learned,
  onToggle,
  onNext,
  onHome,
}: {
  item: RecipeItem;
  category: string;
  learned: boolean;
  onToggle: () => void;
  onNext?: () => void;
  onHome: () => void;
}) {
  const [si, setSi] = useState(0);
  const [cur, setCur] = useState(-1); // last step shown in the picture (-1 = not started)
  const [playing, setPlaying] = useState(false);
  const [tip, setTip] = useState("");
  const s = item.sizes[si];
  const last = s.steps.length - 1;
  const hasScene = (s.scene?.length ?? 0) === s.steps.length;
  const show = (i: number) => {
    setCur(i);
    setTip("");
  };
  const pick = (i: number) => {
    setSi(i);
    setPlaying(false);
    show(-1);
  };
  const step = (d: number) => {
    setPlaying(false);
    show(Math.max(-1, Math.min(last, cur + d)));
  };
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (cur >= last) setPlaying(false);
      else show(cur + 1);
    }, cur < 0 ? 300 : 2400);
    return () => clearTimeout(t);
  }, [playing, cur, last]);
  const play = () => {
    if (playing) return setPlaying(false);
    if (cur >= last) show(-1);
    setPlaying(true);
  };

  return (
    <main className="px-5 pt-6 pb-32">
      <button onClick={onHome} className="text-sm font-semibold text-ember inline-flex items-center gap-1.5">
        <BookOpen className="w-4 h-4" aria-hidden /> Barcha retseptlar
      </button>
      <p className="mt-5 text-xs uppercase tracking-wider text-bean/55 font-semibold">{category}</p>
      <h1 className="font-poster uppercase text-[2.4rem] font-bold leading-none">{item.name}</h1>

      {item.sizes.length > 1 && (
        <div className="mt-5 flex rounded-full border border-line bg-white p-1" role="tablist" aria-label="Hajm">
          {item.sizes.map((z, i) => (
            <button
              key={z.size}
              role="tab"
              aria-selected={i === si}
              onClick={() => pick(i)}
              className={`flex-1 h-10 rounded-full font-semibold transition-colors ${i === si ? "bg-ember text-foam" : "text-bean/70"}`}
            >
              {z.size}
            </button>
          ))}
        </div>
      )}

      {hasScene && (
        <section className="mt-5 card p-4" aria-label="Ichimlik rasmi">
          <CupPicture size={s} upto={cur} onTip={setTip} className="mx-auto max-w-[340px]" />
          <p className="mt-1 min-h-[2.75rem] text-center text-sm leading-snug" aria-live="polite">
            {tip ? (
              <b>{tip}</b>
            ) : cur < 0 ? (
              <span className="text-bean/60">«Keyingi» ni bosing: stakan qadamma-qadam to‘ladi.</span>
            ) : (
              <>
                <span className="font-semibold text-ember tabular-nums">{cur + 1}. </span>
                {s.steps[cur]}
              </>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => step(-1)} disabled={cur < 0} className="btn-ghost w-12 px-0" aria-label="Oldingi qadam">
              <ChevronLeft className="w-5 h-5" aria-hidden />
            </button>
            <button onClick={play} className="btn-ghost w-12 px-0" aria-label={playing ? "To‘xtatish" : "Avtomatik ko‘rsatish"}>
              {playing ? <Pause className="w-5 h-5" aria-hidden /> : <Play className="w-5 h-5" aria-hidden />}
            </button>
            <button onClick={() => (cur >= last ? show(-1) : step(1))} className="btn-primary flex-1">
              {cur >= last ? (
                <>
                  <RotateCcw className="w-4 h-4" aria-hidden /> Boshidan
                </>
              ) : (
                <>
                  Keyingi qadam
                  <span className="tabular-nums text-foam/70 text-sm">
                    {cur + 2}/{last + 1}
                  </span>
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-bean/50">Rasmdagi qatlamni bossangiz, nomi va miqdori chiqadi</p>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-poster uppercase text-xl font-bold">Tarkibi</h2>
        <Ingredients size={s} />
      </section>

      {hasScene && item.sizes.length > 1 && (
        <section className="mt-7">
          <h2 className="font-poster uppercase text-xl font-bold">Hajmlarni solishtiring</h2>
          <p className="text-sm text-bean/60">Tayyor ichimlik, har bir hajmda</p>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${item.sizes.length}, minmax(0, 1fr))` }}>
            {item.sizes.map((z, i) => (
              <button
                key={z.size}
                onClick={() => pick(i)}
                aria-pressed={i === si}
                className={`card p-2 text-left transition-colors ${i === si ? "border-ember ring-1 ring-ember" : ""}`}
              >
                <CupPicture size={z} upto={z.steps.length - 1} mini />
                <span className="block font-poster text-lg font-semibold leading-none">{z.size}</span>
                <span className="mt-1 block text-[11px] leading-snug text-bean/60 tabular-nums">
                  {z.lines
                    .filter((l) => !l.base && l.qty != null)
                    .map((l) => `${l.name} ${l.amount}`)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <h2 className="font-poster uppercase text-xl font-bold">Tayyorlash</h2>
        <p className="text-sm text-bean/60">Qadamni bossangiz, rasm shu qadamga o‘tadi</p>
        <ol className="mt-3 space-y-2">
          {s.steps.map((t, i) => {
            const d = i < cur;
            const now = i === cur;
            return (
              <li key={i}>
                <button
                  onClick={() => {
                    setPlaying(false);
                    show(now ? i - 1 : i);
                    if (hasScene) window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-current={now ? "step" : undefined}
                  className={`w-full card p-3.5 flex gap-3 text-left transition-colors ${now ? "border-ember ring-1 ring-ember" : d ? "bg-foam/50 border-foam" : ""}`}
                >
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums ${d ? "bg-emerald-600 text-white" : "bg-ember text-foam"}`}
                  >
                    {d ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={`leading-relaxed ${d ? "text-bean/55" : ""}`}>{t}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {item.note && (
        <p className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed flex gap-3">
          <TriangleAlert className="w-5 h-5 shrink-0 text-amber-600" aria-hidden /> {item.note}
        </p>
      )}
      {item.tip && (
        <p className="mt-4 card p-4 text-sm leading-relaxed flex gap-3">
          <Lightbulb className="w-5 h-5 shrink-0 text-ember" aria-hidden />
          <span>
            <b>Maslahat. </b>
            {item.tip}
          </span>
        </p>
      )}

      <BottomBar>
        <div className="flex gap-3">
          <button onClick={onToggle} className={`${learned ? "btn-ghost" : "btn-primary"} flex-1`}>
            {learned ? (
              <>
                <Check className="w-5 h-5 text-emerald-600" strokeWidth={3} aria-hidden /> O‘rganildi
              </>
            ) : (
              "Bilaman"
            )}
          </button>
          {onNext && (
            <button onClick={onNext} className="btn-ghost px-4" aria-label="Keyingi ichimlik">
              Keyingi <ChevronRight className="w-5 h-5" aria-hidden />
            </button>
          )}
        </div>
      </BottomBar>
    </main>
  );
}

function Ingredients({ size }: { size: RecipeSize }) {
  const main = size.lines.filter((l) => !l.base);
  const base = size.lines.filter((l) => l.base);
  return (
    <div className="mt-3 card divide-y divide-line">
      {main.map((l) => (
        <div key={l.name} className="px-4 py-3 flex justify-between gap-4">
          <span>{l.name}</span>
          <span className={`font-semibold tabular-nums text-right ${l.qty == null ? "text-bean/50 font-normal" : ""}`}>{l.amount}</span>
        </div>
      ))}
      {base.map((l) => (
        <div key={l.name} className="px-4 py-2.5 flex justify-between gap-4 text-sm text-bean/60 bg-cream/60">
          <span>{l.name}</span>
          <span className="tabular-nums text-right">{l.amount}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── quiz ───────────── */

type Q = { title: string; ask: string; options: string[]; answer: string; size?: RecipeSize };
const ROUND = 10;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const fmt = (q: number, u: string) => `${String(q).replace(".", ",")} ${u}`;

function makeQuiz(book: RecipeBook, count = ROUND): Q[] {
  const all = book.categories.flatMap((c) => c.items.flatMap((it) => it.sizes.map((s) => ({ it, s }))));
  const seen = new Map<string, Set<number>>(); // ingredient → every amount used on the menu
  for (const { s } of all)
    for (const l of s.lines)
      if (l.qty != null && !l.base) {
        if (!seen.has(l.name)) seen.set(l.name, new Set());
        seen.get(l.name)!.add(l.qty);
      }
  const cups = [...new Set(all.map(({ s }) => s.cup))];

  const qs: Q[] = [];
  for (const { it, s } of all) {
    const title = it.sizes.length > 1 ? `${it.name} · ${s.size}` : it.name;
    for (const l of s.lines) {
      if (l.qty == null || l.base || !l.unit) continue;
      const step = l.unit === "ml" ? 50 : l.unit === "dona" ? 1 : 10;
      const near = [l.qty * 2, Math.round(l.qty / 2), l.qty + step, l.qty - step].filter((v) => v > 0);
      const wrong = [...new Set([...shuffle([...(seen.get(l.name) ?? [])]), ...near])].filter((v) => v !== l.qty).slice(0, 3);
      if (wrong.length < 3) continue;
      const answer = fmt(l.qty, l.unit);
      qs.push({ title, ask: `${l.name} qancha?`, answer, size: s, options: shuffle([answer, ...wrong.map((v) => fmt(v, l.unit!))]) });
    }
    const otherCups = shuffle(cups.filter((c) => c !== s.cup)).slice(0, 3);
    qs.push({ title, ask: "Qaysi stakanda beriladi?", answer: s.cup, options: shuffle([s.cup, ...otherCups]) });
  }
  return shuffle(qs).slice(0, count);
}

function Quiz({ book, onHome }: { book: RecipeBook; onHome: () => void }) {
  const [qs, setQs] = useState(() => makeQuiz(book));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const restart = () => {
    setQs(makeQuiz(book));
    setI(0);
    setPicked(null);
    setScore(0);
  };

  if (i >= qs.length)
    return (
      <main className="min-h-dvh px-5 pt-10 pb-32 flex flex-col">
        <span className="w-14 h-14 rounded-full bg-ember text-foam flex items-center justify-center">
          <GraduationCap className="w-7 h-7" />
        </span>
        <h1 className="mt-5 font-poster uppercase text-[2.4rem] font-bold leading-none">
          {score} / {qs.length}
        </h1>
        <p className="mt-3 text-bean/75 leading-relaxed">
          {score === qs.length
            ? "Zo‘r! Hammasi to‘g‘ri."
            : score >= qs.length * 0.7
              ? "Yaxshi natija. Xato qilgan ichimliklarni yana bir ko‘rib chiqing."
              : "Retseptlarni yana bir bor ko‘rib chiqing va qaytadan urinib ko‘ring."}
        </p>
        <BottomBar>
          <div className="flex gap-3">
            <button onClick={onHome} className="btn-ghost flex-1">Retseptlar</button>
            <button onClick={restart} className="btn-primary flex-1">
              <RotateCcw className="w-4 h-4" aria-hidden /> Yana
            </button>
          </div>
        </BottomBar>
      </main>
    );

  const q = qs[i];
  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === q.answer;
    haptic(ok ? "success" : "error");
    if (ok) setScore(score + 1);
  };

  return (
    <main className="px-5 pt-6 pb-32">
      <div className="flex items-center justify-between text-sm">
        <span className="text-bean/60 tabular-nums">
          Savol {i + 1} / {qs.length}
        </span>
        <span className="font-semibold text-emerald-700 tabular-nums">To‘g‘ri: {score}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-ember transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>

      <p className="mt-8 text-xs uppercase tracking-wider text-bean/55 font-semibold">{q.title}</p>
      <h1 className="font-poster uppercase text-[2.1rem] font-bold leading-tight">{q.ask}</h1>
      {q.size?.scene?.length === q.size?.steps.length && q.size && (
        <CupPicture key={i} size={q.size} upto={q.size.steps.length - 1} mini crop className="mx-auto mt-4 w-32" />
      )}

      <div className="mt-6 grid gap-3" aria-live="polite">
        {q.options.map((o) => {
          const right = picked && o === q.answer;
          const wrong = picked === o && o !== q.answer;
          return (
            <button
              key={o}
              onClick={() => choose(o)}
              disabled={!!picked}
              className={`card min-h-14 px-4 py-3 flex items-center justify-between gap-3 text-left font-semibold tabular-nums transition-colors disabled:cursor-default ${
                right ? "border-emerald-600 bg-emerald-50" : wrong ? "border-red-500 bg-red-50" : ""
              }`}
            >
              {o}
              {right && <Check className="w-5 h-5 text-emerald-600" strokeWidth={3} aria-label="To‘g‘ri" />}
              {wrong && <X className="w-5 h-5 text-red-500" strokeWidth={3} aria-label="Noto‘g‘ri" />}
            </button>
          );
        })}
      </div>

      <BottomBar>
        {picked ? (
          <button
            onClick={() => {
              setI(i + 1);
              setPicked(null);
            }}
            className="btn-primary w-full"
          >
            {i + 1 < qs.length ? "Keyingi savol" : "Natijani ko‘rish"}
          </button>
        ) : (
          <button onClick={onHome} className="btn-ghost w-full">Mashqni tugatish</button>
        )}
      </BottomBar>
    </main>
  );
}
