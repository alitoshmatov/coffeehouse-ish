import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  GraduationCap,
  Lightbulb,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { haptic, tg } from "@/lib/telegram";
import type { RecipeBook, RecipeItem, RecipeSize } from "@/shared/types";
import { BottomBar } from "./BottomBar";
import { CupPicture } from "./CupScene";
import { BADGES, levelOf, useGame, XP, type GameState, type Toast } from "./game";

/**
 * Recipe course for trial baristas: golden rules, every drink with its sizes,
 * ingredients and numbered steps (with an animated cup picture that fills step by step), and a quiz.
 * Gamified: XP and barista levels, a daily streak, badges, a short check per drink
 * ("Bilaman" → pass the check → learned) and a quiz with combos, stars and a mistakes round.
 * Progress is kept on this phone.
 */

type View = { k: "home" } | { k: "item"; id: string } | { k: "check"; id: string } | { k: "quiz" };
type Game = ReturnType<typeof useGame>;

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

  const badgeName = useCallback(
    (id: string) => BADGES[id]?.name ?? `${book?.categories.find((c) => `cat:${c.id}` === id)?.title ?? ""} ustasi`,
    [book],
  );
  const game = useGame(badgeName);

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
    const back = () => (view.k === "home" ? onExit() : view.k === "check" ? go({ k: "item", id: view.id }) : go({ k: "home" }));
    tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg?.BackButton.offClick(back);
  }, [view, onExit]);

  const saveLearned = (next: Set<string>) => {
    setLearned(next);
    try {
      localStorage.setItem(storeKey(), JSON.stringify([...next]));
    } catch {
      /* storage unavailable — keep in memory */
    }
  };
  const forget = (id: string) => {
    const next = new Set(learned);
    next.delete(id);
    saveLearned(next);
  };
  /** Passed the drink check: mark learned, give XP and any category / menu badges. */
  const master = (id: string) => {
    if (!book || learned.has(id)) return;
    const next = new Set(learned).add(id);
    saveLearned(next);
    const fresh = book.categories.filter((c) => c.items.every((it) => next.has(it.id))).map((c) => `cat:${c.id}`);
    if (book.categories.every((c) => c.items.every((it) => next.has(it.id)))) fresh.push("all");
    game.update((s) => ({ ...s, badges: [...new Set([...s.badges, ...fresh])] }), XP.learn, "Ichimlik o‘rganildi");
  };

  const items = useMemo(() => book?.categories.flatMap((c) => c.items.map((it) => ({ ...it, cat: c.title }))) ?? [], [book]);

  const overlay = (
    <>
      <Toasts toasts={game.toasts} />
      <Confetti key={game.party} on={game.party > 0} />
    </>
  );

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

  if (view.k === "item" || view.k === "check") {
    const i = items.findIndex((it) => it.id === view.id);
    const it = items[i];
    if (it && view.k === "check")
      return (
        <>
          <DrinkCheck
            key={it.id}
            book={book}
            item={it}
            game={game}
            onPass={() => master(it.id)}
            onBack={() => go({ k: "item", id: it.id })}
            onNext={i < items.length - 1 ? () => go({ k: "item", id: items[i + 1].id }) : () => go({ k: "home" })}
          />
          {overlay}
        </>
      );
    if (it)
      return (
        <>
          <DrinkView
            key={it.id}
            item={it}
            category={it.cat}
            learned={learned.has(it.id)}
            watched={game.g.watched.includes(it.id)}
            onWatched={() =>
              game.update(
                (s) => ({ ...s, watched: [...s.watched, it.id], badges: s.badges.includes("first") ? s.badges : [...s.badges, "first"] }),
                XP.watch,
                "Qadamlar ko‘rildi",
              )
            }
            onCheck={() => go({ k: "check", id: it.id })}
            onForget={() => forget(it.id)}
            onNext={i < items.length - 1 ? () => go({ k: "item", id: items[i + 1].id }) : undefined}
            onHome={() => go({ k: "home" })}
          />
          {overlay}
        </>
      );
  }
  if (view.k === "quiz")
    return (
      <>
        <Quiz book={book} game={game} onHome={() => go({ k: "home" })} />
        {overlay}
      </>
    );

  const done = items.filter((it) => learned.has(it.id)).length;
  const nextUp = items.find((it) => !learned.has(it.id));
  const L = levelOf(game.g.xp);
  const allBadges = [
    ...Object.entries(BADGES).filter(([id]) => id !== "all"),
    ...book.categories.map((c) => [`cat:${c.id}`, { name: `${c.title} ustasi`, desc: `«${c.title}» bo‘limini to‘liq o‘rganing` }] as const),
    ["all", BADGES.all] as const,
  ];

  return (
    <main className="pb-28">
      <header className="bg-ember text-foam px-5 pt-8 pb-7">
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-foam/25 px-3 py-1 text-xs">
            <GraduationCap className="w-3.5 h-3.5" aria-hidden /> Sinov muddati · o‘quv
          </p>
          <p className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${game.g.streak ? "bg-amber-400/20 text-amber-200" : "bg-foam/10 text-foam/60"}`}>
            <Flame className={`w-4 h-4 ${game.g.streak ? "fill-amber-300 text-amber-300" : ""}`} aria-hidden /> {game.g.streak} kun
          </p>
        </div>
        <h1 className="mt-4 font-poster uppercase font-bold leading-[0.95] text-[2.6rem]">Retseptlarni o‘rganamiz</h1>

        {/* level card */}
        <div className="mt-5 rounded-2xl bg-foam/10 border border-foam/15 p-4">
          <div className="flex items-center gap-3">
            <span className="relative w-12 h-12 shrink-0 rounded-full bg-rose text-ember flex items-center justify-center font-poster text-2xl font-bold">
              {L.n}
              <Star className="absolute -top-1 -right-1 w-5 h-5 fill-amber-300 text-amber-400" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-wider text-foam/60">Daraja {L.n}</span>
              <span className="block font-poster uppercase text-2xl font-bold leading-none">{L.name}</span>
            </span>
            <span className="text-right">
              <span className="block font-semibold tabular-nums">{game.g.xp} XP</span>
              {L.next && <span className="block text-xs text-foam/60 tabular-nums">keyingisi {L.next}</span>}
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-foam/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose transition-all duration-700" style={{ width: `${L.progress * 100}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-foam/75">O‘rganilgan ichimliklar</span>
            <span className="font-semibold tabular-nums">
              {done} / {items.length}
            </span>
          </div>
        </div>
      </header>

      {/* how it works — three simple steps */}
      <section className="px-5 pt-6">
        <ol className="grid grid-cols-3 gap-2 text-center text-xs leading-snug">
          {[
            [BookOpen, "Ko‘ring", `qadamlarni oxirigacha · +${XP.watch} XP`],
            [Target, "Tekshiring", `«Bilaman» testi · +${XP.learn} XP`],
            [Zap, "Mashq qiling", `har javob +${XP.correct} XP`],
          ].map(([Icon, t, d], n) => {
            const I = Icon as typeof BookOpen;
            return (
              <li key={n} className="card p-3">
                <I className="w-5 h-5 mx-auto text-ember" aria-hidden />
                <span className="mt-1.5 block font-semibold text-sm">{t as string}</span>
                <span className="block text-bean/55">{d as string}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {nextUp && (
        <section className="px-5 pt-5">
          <button onClick={() => go({ k: "item", id: nextUp.id })} className="w-full card p-3 flex items-center gap-3 text-left border-ember/40 bg-gradient-to-r from-foam/70 to-white">
            <span className="w-16 shrink-0">
              <CupPicture size={nextUp.sizes[0]} upto={nextUp.sizes[0].steps.length - 1} mini crop />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-wider text-ember font-semibold">{done ? "Davom ettiring" : "Shundan boshlang"}</span>
              <span className="block font-poster uppercase text-2xl font-bold leading-tight">{nextUp.name}</span>
              <span className="block text-sm text-bean/55">{nextUp.cat}</span>
            </span>
            <span className="w-10 h-10 shrink-0 rounded-full bg-ember text-foam flex items-center justify-center">
              <Play className="w-5 h-5 fill-foam" aria-hidden />
            </span>
          </button>
        </section>
      )}

      {/* badges */}
      <section className="pt-7">
        <h2 className="px-5 font-poster uppercase text-2xl font-bold">Nishonlar</h2>
        <p className="px-5 text-sm text-bean/60">
          {game.g.badges.length} / {allBadges.length} ochildi
        </p>
        <ul className="mt-3 px-5 flex gap-3 overflow-x-auto pb-2 snap-x">
          {allBadges.map(([id, b]) => {
            const got = game.g.badges.includes(id);
            return (
              <li key={id} className={`snap-start shrink-0 w-28 card p-3 text-center ${got ? "border-amber-300 bg-amber-50" : "opacity-70"}`}>
                <span className={`mx-auto w-11 h-11 rounded-full flex items-center justify-center ${got ? "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow" : "bg-line text-bean/40"}`}>
                  {got ? <Award className="w-6 h-6" aria-hidden /> : <Lock className="w-5 h-5" aria-hidden />}
                </span>
                <span className="mt-2 block text-xs font-semibold leading-tight">{b.name}</span>
                <span className="mt-1 block text-[10px] leading-snug text-bean/55">{b.desc}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-5 pt-6">
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

      {book.categories.map((c) => {
        const got = c.items.filter((it) => learned.has(it.id)).length;
        return (
          <section key={c.id} className="px-5 pt-7">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-poster uppercase text-2xl font-bold">{c.title}</h2>
              <span className={`text-sm font-semibold tabular-nums ${got === c.items.length ? "text-emerald-700" : "text-bean/50"}`}>
                {got === c.items.length && <Trophy className="inline w-4 h-4 -mt-0.5 mr-1 text-amber-500" aria-hidden />}
                {got}/{c.items.length}
              </span>
            </div>
            {c.note && <p className="text-sm text-bean/60">{c.note}</p>}
            <ul className="mt-3 card divide-y divide-line">
              {c.items.map((it) => {
                const ok = learned.has(it.id);
                const seen = game.g.watched.includes(it.id);
                return (
                  <li key={it.id}>
                    <button onClick={() => go({ k: "item", id: it.id })} className="w-full px-3 py-2.5 flex items-center gap-3 text-left">
                      <span className="relative w-11 shrink-0">
                        <CupPicture size={it.sizes[0]} upto={it.sizes[0].steps.length - 1} mini crop />
                        {ok && (
                          <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white" aria-label="O‘rganilgan">
                            <Check className="w-3 h-3" strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{it.name}</span>
                        <span className="block text-sm text-bean/55">
                          {it.sizes.map((s) => s.size).join(" · ")}
                          {!ok && seen && <span className="text-ember"> · testga tayyor</span>}
                        </span>
                      </span>
                      <ChevronRight className="w-5 h-5 shrink-0 text-bean/40" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <BottomBar>
        <button onClick={() => go({ k: "quiz" })} className="btn-primary w-full">
          <Zap className="w-5 h-5" aria-hidden /> Mashq qilish
          {game.g.bestCombo > 0 && <span className="text-foam/70 text-sm tabular-nums">· rekord {game.g.bestCombo}</span>}
        </button>
      </BottomBar>
      {overlay}
    </main>
  );
}

/* ───────────── toasts and confetti ───────────── */

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-5" aria-live="polite">
      {toasts.map((t) =>
        t.kind === "xp" ? (
          <div key={t.id} className="game-pop rounded-full bg-bean text-foam px-4 py-2 text-sm font-semibold shadow-lg flex items-center gap-2">
            <Zap className="w-4 h-4 fill-amber-300 text-amber-300" aria-hidden /> {t.text}
            {t.sub && <span className="font-normal text-foam/70">{t.sub}</span>}
          </div>
        ) : (
          <div key={t.id} className="game-pop w-full max-w-sm rounded-2xl bg-white border-2 border-amber-300 px-4 py-3 shadow-xl flex items-center gap-3">
            <span className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-white flex items-center justify-center">
              {t.kind === "level" ? <Star className="w-6 h-6 fill-white" aria-hidden /> : <Award className="w-6 h-6" aria-hidden />}
            </span>
            <span>
              <span className="block text-xs uppercase tracking-wider text-amber-700 font-semibold">{t.sub}</span>
              <span className="block font-poster uppercase text-xl font-bold leading-tight">{t.text}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

const CONFETTI = ["#71292A", "#F5C9BD", "#f2b84b", "#3f8f45", "#5b9bd5"];
function Confetti({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 9) * 0.07}s`,
            animationDuration: `${1.6 + (i % 5) * 0.25}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/* ───────────── one drink ───────────── */

function DrinkView({
  item,
  category,
  learned,
  watched,
  onWatched,
  onCheck,
  onForget,
  onNext,
  onHome,
}: {
  item: RecipeItem;
  category: string;
  learned: boolean;
  watched: boolean;
  onWatched: () => void;
  onCheck: () => void;
  onForget: () => void;
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
    }, cur < 0 ? 300 : 2600);
    return () => clearTimeout(t);
  }, [playing, cur, last]);
  // reaching the last step for the first time gives XP
  useEffect(() => {
    if (cur === last && !watched) onWatched();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, last]);
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
      <h1 className="font-poster uppercase text-[2.4rem] font-bold leading-none flex items-center gap-2">
        {item.name}
        {learned && <Trophy className="w-6 h-6 text-amber-500" aria-label="O‘rganilgan" />}
      </h1>

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
        <section className="mt-5 card p-4 overflow-hidden" aria-label="Ichimlik rasmi">
          {/* step dots: a little progress path */}
          <div className="flex items-center gap-1 mb-2" aria-hidden>
            {s.steps.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= cur ? "bg-ember" : "bg-line"}`} />
            ))}
          </div>
          <CupPicture size={s} upto={cur} onTip={setTip} className="mx-auto max-w-[340px]" />
          <p key={`${cur}-${tip}`} className="game-fade mt-1 min-h-[2.75rem] text-center text-sm leading-snug" aria-live="polite">
            {tip ? (
              <b>{tip}</b>
            ) : cur < 0 ? (
              <span className="text-bean/60">«Keyingi» ni bosing yoki ▶ — stakan qadamma-qadam to‘ladi.</span>
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
          {cur >= last && !learned && (
            <button onClick={onCheck} className="game-pop mt-3 w-full rounded-2xl bg-amber-50 border border-amber-300 p-3 flex items-center gap-3 text-left">
              <Target className="w-6 h-6 shrink-0 text-amber-600" aria-hidden />
              <span className="flex-1 text-sm">
                <b>Eslab qoldingizmi?</b> Qisqa testdan o‘ting va <b>+{XP.learn} XP</b> oling.
              </span>
              <ChevronRight className="w-5 h-5 text-amber-600" aria-hidden />
            </button>
          )}
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
          {learned ? (
            <button onClick={onForget} className="btn-ghost flex-1" aria-label="O‘rganildi — belgini olib tashlash">
              <Check className="w-5 h-5 text-emerald-600" strokeWidth={3} aria-hidden /> O‘rganildi
            </button>
          ) : (
            <button onClick={onCheck} className="btn-primary flex-1">
              <Target className="w-5 h-5" aria-hidden /> Bilaman
            </button>
          )}
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

/* ───────────── questions ───────────── */

type Q = {
  key: string; // stable id, for the mistakes round
  title: string;
  ask: string;
  options: string[];
  answer: string;
  size?: RecipeSize;
  upto?: number; // picture: show the drink up to this step
  quote?: string; // a step text shown above the options
  long?: boolean; // long text options
  itemId?: string;
};
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
const hasPic = (s: RecipeSize) => (s.scene?.length ?? 0) === s.steps.length;

/** Every question the menu allows. `only` limits to one drink (the per-drink check). */
function allQuestions(book: RecipeBook, only?: string): Q[] {
  const cats = book.categories.map((c) => ({ c, all: c.items.flatMap((it) => it.sizes.map((s) => ({ it, s }))) }));
  const all = cats.flatMap((x) => x.all);
  const seen = new Map<string, Set<number>>(); // ingredient → every amount used on the menu
  for (const { s } of all)
    for (const l of s.lines)
      if (l.qty != null && !l.base) {
        if (!seen.has(l.name)) seen.set(l.name, new Set());
        seen.get(l.name)!.add(l.qty);
      }
  const cups = [...new Set(all.map(({ s }) => s.cup))];

  const qs: Q[] = [];
  for (const { c, all: inCat } of cats)
    for (const { it, s } of inCat) {
      if (only && it.id !== only) continue;
      const title = it.sizes.length > 1 ? `${it.name} · ${s.size}` : it.name;
      const base = `${it.id}/${s.size}`;
      // amounts
      for (const l of s.lines) {
        if (l.qty == null || l.base || !l.unit) continue;
        const step = l.unit === "ml" ? 50 : l.unit === "dona" ? 1 : 10;
        const near = [l.qty * 2, Math.round(l.qty / 2), l.qty + step, l.qty - step].filter((v) => v > 0);
        const wrong = [...new Set([...shuffle([...(seen.get(l.name) ?? [])]), ...near])].filter((v) => v !== l.qty).slice(0, 3);
        if (wrong.length < 3) continue;
        const answer = fmt(l.qty, l.unit);
        qs.push({ key: `${base}/amt/${l.name}`, itemId: it.id, title, ask: `${l.name} qancha?`, answer, size: s, upto: s.steps.length - 1, options: shuffle([answer, ...wrong.map((v) => fmt(v, l.unit!))]) });
      }
      // cup
      const otherCups = shuffle(cups.filter((x) => x !== s.cup)).slice(0, 3);
      qs.push({ key: `${base}/cup`, itemId: it.id, title, ask: "Qaysi stakanda beriladi?", answer: s.cup, options: shuffle([s.cup, ...otherCups]) });
      // what comes next? (learns the order of steps)
      if (s.steps.length >= 5) {
        const i = Math.floor(Math.random() * (s.steps.length - 2));
        const answer = s.steps[i + 1];
        const wrong = shuffle(s.steps.filter((t, k) => k !== i && k !== i + 1 && t !== answer)).slice(0, 3);
        if (wrong.length === 3)
          qs.push({
            key: `${base}/next`,
            itemId: it.id,
            title,
            ask: "Keyingi qadam qaysi?",
            quote: `${i + 1}. ${s.steps[i]}`,
            answer,
            options: shuffle([answer, ...wrong]),
            size: hasPic(s) ? s : undefined,
            upto: i,
            long: true,
          });
      }
      // which drink is this? (picture; wrong answers come from other categories so the picture decides)
      if (!only && hasPic(s) && s === it.sizes[it.sizes.length - 1]) {
        const others = shuffle([...new Set(cats.filter((x) => x.c.id !== c.id).flatMap((x) => x.c.items.map((o) => o.name)))]).slice(0, 3);
        if (others.length === 3)
          qs.push({ key: `${it.id}/pic`, itemId: it.id, title: "Rasmga qarang", ask: "Bu qaysi ichimlik?", answer: it.name, options: shuffle([it.name, ...others]), size: s, upto: s.steps.length - 1 });
      }
    }
  return qs;
}

function makeQuiz(book: RecipeBook, count = ROUND): Q[] {
  return shuffle(allQuestions(book)).slice(0, count);
}
function makeCheck(book: RecipeBook, id: string): Q[] {
  const qs = shuffle(allQuestions(book, id));
  // one of each kind first, so the check covers amounts, cup and the order of steps
  const pick: Q[] = [];
  for (const kind of ["/next", "/amt/", "/cup"]) {
    const q = qs.find((x) => x.key.includes(kind) && !pick.includes(x));
    if (q) pick.push(q);
  }
  for (const q of qs) if (pick.length < 4 && !pick.includes(q)) pick.push(q);
  return shuffle(pick);
}

/** One running set of questions. Reports the score and the questions answered wrong. */
function QuizRun({
  qs,
  game,
  label,
  onDone,
  onQuit,
}: {
  qs: Q[];
  game: Game;
  label: string;
  onDone: (score: number, missed: Q[], xp: number) => void;
  onQuit: () => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [missed, setMissed] = useState<Q[]>([]);
  const [earned, setEarned] = useState(0);
  const [shake, setShake] = useState(0);
  const q = qs[i];

  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === q.answer;
    haptic(ok ? "success" : "error");
    if (ok) {
      const c = combo + 1;
      const xp = XP.correct + (c >= 3 ? XP.comboBonus : 0);
      setScore(score + 1);
      setCombo(c);
      setEarned(earned + xp);
      game.update(
        (s) => ({ ...s, bestCombo: Math.max(s.bestCombo, c), badges: c >= 5 && !s.badges.includes("combo5") ? [...s.badges, "combo5"] : s.badges }),
        xp,
        c >= 3 ? `${c} ketma-ket!` : "To‘g‘ri",
      );
    } else {
      setCombo(0);
      setMissed([...missed, q]);
      setShake((n) => n + 1);
    }
  };
  const next = () => {
    if (i + 1 >= qs.length) onDone(score, missed, earned);
    else {
      setI(i + 1);
      setPicked(null);
    }
  };

  return (
    <main className="px-5 pt-6 pb-32">
      <div className="flex items-center justify-between text-sm">
        <span className="text-bean/60 tabular-nums">
          {label} · {i + 1} / {qs.length}
        </span>
        <span className={`inline-flex items-center gap-1 font-semibold tabular-nums transition-colors ${combo >= 3 ? "text-amber-600" : "text-emerald-700"}`}>
          {combo >= 2 && <Flame key={combo} className="game-pop w-4 h-4 fill-amber-400 text-amber-500" aria-hidden />}
          {combo >= 2 ? `${combo} ketma-ket` : `To‘g‘ri: ${score}`}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {qs.map((x, k) => (
          <span
            key={k}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              k < i || (k === i && picked) ? (missed.includes(x) ? "bg-red-400" : "bg-emerald-500") : k === i ? "bg-ember" : "bg-line"
            }`}
          />
        ))}
      </div>

      <div key={i} className="game-fade">
        <p className="mt-7 text-xs uppercase tracking-wider text-bean/55 font-semibold">{q.title}</p>
        <h1 className="font-poster uppercase text-[2.1rem] font-bold leading-tight">{q.ask}</h1>
        {q.quote && <p className="mt-3 rounded-xl bg-foam/60 border border-foam px-4 py-3 text-sm leading-relaxed">{q.quote}</p>}
        {q.size && hasPic(q.size) && (
          <CupPicture size={q.size} upto={q.upto ?? q.size.steps.length - 1} mini crop className={`mx-auto mt-4 ${q.long ? "w-24" : "w-32"}`} />
        )}

        <div key={shake} className={`mt-6 grid gap-3 ${shake && picked && picked !== q.answer ? "game-shake" : ""}`} aria-live="polite">
          {q.options.map((o) => {
            const right = picked && o === q.answer;
            const wrong = picked === o && o !== q.answer;
            return (
              <button
                key={o}
                onClick={() => choose(o)}
                disabled={!!picked}
                className={`card min-h-14 px-4 py-3 flex items-center justify-between gap-3 text-left transition-all disabled:cursor-default active:scale-[0.98] ${
                  q.long ? "text-sm leading-snug" : "font-semibold tabular-nums"
                } ${right ? "border-emerald-600 bg-emerald-50 game-pop" : wrong ? "border-red-500 bg-red-50" : picked ? "opacity-60" : ""}`}
              >
                {o}
                {right && <Check className="w-5 h-5 shrink-0 text-emerald-600" strokeWidth={3} aria-label="To‘g‘ri" />}
                {wrong && <X className="w-5 h-5 shrink-0 text-red-500" strokeWidth={3} aria-label="Noto‘g‘ri" />}
              </button>
            );
          })}
        </div>
        {picked && (
          <p className={`game-fade mt-4 text-center text-sm font-semibold ${picked === q.answer ? "text-emerald-700" : "text-red-600"}`}>
            {picked === q.answer ? (combo >= 3 ? `Zo‘r! ${combo} ta ketma-ket` : "To‘g‘ri!") : "Eslab qoling: to‘g‘ri javob yashil bilan belgilandi"}
          </p>
        )}
      </div>

      <BottomBar>
        {picked ? (
          <button onClick={next} className="btn-primary w-full">
            {i + 1 < qs.length ? "Keyingi savol" : "Natijani ko‘rish"}
          </button>
        ) : (
          <button onClick={onQuit} className="btn-ghost w-full">To‘xtatish</button>
        )}
      </BottomBar>
    </main>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-2" aria-label={`${n} yulduz`}>
      {[0, 1, 2].map((k) => (
        <Star
          key={k}
          style={{ animationDelay: `${k * 0.18}s` }}
          className={`game-pop w-12 h-12 ${k < n ? "fill-amber-400 text-amber-500" : "text-line"} ${k === 1 ? "-mt-3" : ""}`}
          aria-hidden
        />
      ))}
    </div>
  );
}
const starsFor = (score: number, total: number) => (score >= total * 0.9 ? 3 : score >= total * 0.7 ? 2 : score >= total * 0.4 ? 1 : 0);

function Missed({ missed }: { missed: Q[] }) {
  if (!missed.length) return null;
  return (
    <section className="mt-6">
      <h2 className="font-poster uppercase text-xl font-bold">Xatolar ustida ishlaymiz</h2>
      <ul className="mt-3 space-y-2">
        {missed.map((q) => (
          <li key={q.key} className="card p-3.5 text-sm leading-relaxed">
            <span className="block text-xs uppercase tracking-wider text-bean/55 font-semibold">{q.title}</span>
            <span className="block">{q.ask}</span>
            <span className="mt-1 flex gap-2 font-semibold text-emerald-700">
              <Check className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={3} aria-hidden /> {q.answer}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── per-drink check ("Bilaman") ───────────── */

function DrinkCheck({
  book,
  item,
  game,
  onPass,
  onBack,
  onNext,
}: {
  book: RecipeBook;
  item: RecipeItem;
  game: Game;
  onPass: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [qs, setQs] = useState(() => makeCheck(book, item.id));
  const [run, setRun] = useState(0);
  const [res, setRes] = useState<{ score: number; missed: Q[]; xp: number } | null>(null);

  if (!res)
    return (
      <QuizRun
        key={run}
        qs={qs}
        game={game}
        label={item.name}
        onQuit={onBack}
        onDone={(score, missed, xp) => {
          const pass = score >= qs.length - 1;
          if (pass) onPass();
          setRes({ score, missed, xp });
        }}
      />
    );

  const pass = res.score >= qs.length - 1;
  return (
    <main className="min-h-dvh px-5 pt-10 pb-32">
      <Stars n={starsFor(res.score, qs.length)} />
      <h1 className="mt-5 text-center font-poster uppercase text-[2.4rem] font-bold leading-none">{pass ? `${item.name} — o‘rganildi!` : "Yana bir urinish"}</h1>
      <p className="mt-3 text-center text-bean/75 leading-relaxed">
        {res.score} / {qs.length} to‘g‘ri · <b>+{res.xp + (pass ? XP.learn : 0)} XP</b>
        <br />
        {pass ? "Ajoyib! Keyingi ichimlikka o‘ting." : `O‘tish uchun kamida ${qs.length - 1} ta to‘g‘ri javob kerak. Retseptni yana bir ko‘rib chiqing.`}
      </p>
      <Missed missed={res.missed} />
      <BottomBar>
        <div className="flex gap-3">
          {pass ? (
            <>
              <button onClick={onBack} className="btn-ghost flex-1">Retsept</button>
              <button onClick={onNext} className="btn-primary flex-1">
                Keyingi <ChevronRight className="w-5 h-5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <button onClick={onBack} className="btn-ghost flex-1">
                <BookOpen className="w-4 h-4" aria-hidden /> Ko‘rib chiqish
              </button>
              <button
                onClick={() => {
                  setQs(makeCheck(book, item.id));
                  setRun(run + 1);
                  setRes(null);
                }}
                className="btn-primary flex-1"
              >
                <RotateCcw className="w-4 h-4" aria-hidden /> Qayta
              </button>
            </>
          )}
        </div>
      </BottomBar>
    </main>
  );
}

/* ───────────── quiz ───────────── */

function Quiz({ book, game, onHome }: { book: RecipeBook; game: Game; onHome: () => void }) {
  const [qs, setQs] = useState(() => makeQuiz(book));
  const [run, setRun] = useState(0);
  const [res, setRes] = useState<{ score: number; missed: Q[]; xp: number } | null>(null);
  const start = (next: Q[]) => {
    setQs(next);
    setRun(run + 1);
    setRes(null);
  };

  if (!res)
    return (
      <QuizRun
        key={run}
        qs={qs}
        game={game}
        label="Mashq"
        onQuit={onHome}
        onDone={(score, missed, xp) => {
          if (score === qs.length && qs.length >= 5) game.update((s) => ({ ...s, badges: s.badges.includes("perfect") ? s.badges : [...s.badges, "perfect"] }), XP.perfect, "Mukammal raund");
          setRes({ score, missed, xp: xp + (score === qs.length && qs.length >= 5 ? XP.perfect : 0) });
        }}
      />
    );

  const stars = starsFor(res.score, qs.length);
  return (
    <main className="min-h-dvh px-5 pt-10 pb-32">
      <Stars n={stars} />
      <h1 className="mt-5 text-center font-poster uppercase text-[2.6rem] font-bold leading-none tabular-nums">
        {res.score} / {qs.length}
      </h1>
      <p className="mt-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bean text-foam px-4 py-1.5 text-sm font-semibold">
          <Sparkles className="w-4 h-4 text-amber-300" aria-hidden /> +{res.xp} XP
        </span>
      </p>
      <p className="mt-4 text-center text-bean/75 leading-relaxed">
        {res.score === qs.length
          ? "Zo‘r! Hammasi to‘g‘ri."
          : stars >= 2
            ? "Yaxshi natija. Xatolarni qayta ishlab, mukammal natijaga erishing."
            : "Retseptlarni yana bir bor ko‘rib chiqing va qaytadan urinib ko‘ring."}
      </p>
      <LevelLine g={game.g} />
      <Missed missed={res.missed} />
      <BottomBar>
        <div className="flex gap-3">
          <button onClick={onHome} className="btn-ghost flex-1">Retseptlar</button>
          {res.missed.length ? (
            <button onClick={() => start(shuffle(res.missed))} className="btn-primary flex-1">
              <Target className="w-4 h-4" aria-hidden /> Xatolar
            </button>
          ) : (
            <button onClick={() => start(makeQuiz(book))} className="btn-primary flex-1">
              <RotateCcw className="w-4 h-4" aria-hidden /> Yana
            </button>
          )}
        </div>
      </BottomBar>
    </main>
  );
}

function LevelLine({ g }: { g: GameState }) {
  const L = levelOf(g.xp);
  return (
    <div className="mt-6 card p-4">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">
          {L.n}-daraja · {L.name}
        </span>
        <span className="tabular-nums text-bean/60">
          {g.xp}
          {L.next ? ` / ${L.next}` : ""} XP
        </span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-ember transition-all duration-700" style={{ width: `${L.progress * 100}%` }} />
      </div>
    </div>
  );
}
