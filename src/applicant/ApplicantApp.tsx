import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Coffee, Loader2, MapPin } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { tg } from "@/lib/telegram";
import type { MyApplication, PublicRound } from "@/shared/types";
import { DEFAULT_CONTENT } from "@/shared/hiring";
import { JobIntro } from "./JobIntro";
import { ApplyForm } from "./ApplyForm";
import { StatusView } from "./StatusView";
import { LearnView } from "./LearnView";

type Screen = "pick" | "intro" | "form" | "status" | "learn";
type Me = { rounds: PublicRound[]; application: MyApplication | null; applicationRound: PublicRound | null };

// The bot's "Boshqa vaqt so‘rash" button opens the app with ?reschedule=1
const startWithReschedule = new URLSearchParams(window.location.search).has("reschedule");

export default function ApplicantApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>("intro");
  const [roundId, setRoundId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<Me>("/api/me");
      setMe(data);
      setRoundId(data.rounds.length === 1 ? data.rounds[0].id : null);
      setScreen(data.application ? "status" : data.rounds.length > 1 ? "pick" : "intro");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);

  useEffect(() => {
    if (tg) load();
  }, [load]);

  const multiple = (me?.rounds.length ?? 0) > 1;
  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };

  // Telegram's native back button mirrors in-app navigation
  useEffect(() => {
    if (!tg || screen === "learn") return; // the recipe course drives the back button itself
    const back = () => go(screen === "form" ? "intro" : "pick");
    if (screen === "form" || (screen === "intro" && multiple)) {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    } else tg.BackButton.hide();
    return () => tg?.BackButton.offClick(back);
  }, [screen, multiple]);

  if (!tg) return <Centered title="Ilovani Telegram orqali oching" text="Ariza topshirish uchun Coffee House botidagi “Ariza” tugmasini bosing." />;
  if (error) return <Centered title="Ulanib bo‘lmadi" text={error} action={{ label: "Qayta urinish", onClick: load }} />;
  if (!me) return <Centered loading />;

  if (screen === "learn" && me.application?.status === "trial") return <LearnView onExit={() => go("status")} />;

  if (screen === "status" && me.application)
    return (
      <StatusView
        application={me.application}
        content={me.applicationRound?.content ?? DEFAULT_CONTENT}
        canReapply={me.rounds.length > 0 && me.application.status === "rejected"}
        onReapply={() => go(multiple ? "pick" : "intro")}
        onLearn={() => go("learn")}
        onRefresh={load}
        onUpdate={(application) => setMe({ ...me, application })}
        startWithReschedule={startWithReschedule}
      />
    );

  if (me.rounds.length === 0)
    return <Centered title="Hozircha ishga qabul yopiq" text="Yangi o‘rin ochilganda shu bot orqali xabar beramiz. Qiziqishingiz uchun rahmat!" />;

  const round = me.rounds.find((r) => r.id === roundId);
  if (screen === "pick" || !round)
    return (
      <RoundPicker
        rounds={me.rounds}
        onPick={(id) => {
          setRoundId(id);
          go("intro");
        }}
      />
    );

  if (screen === "form")
    return (
      <ApplyForm
        round={round}
        onDone={(application) => {
          setMe({ ...me, application, applicationRound: round });
          go("status");
        }}
        onClosed={load}
      />
    );

  return <JobIntro content={round.content} onApply={() => go("form")} />;
}

/** Shown when several rounds (e.g. different branches) are open at once. */
function RoundPicker({ rounds, onPick }: { rounds: PublicRound[]; onPick: (id: number) => void }) {
  return (
    <main className="min-h-dvh">
      <header className="bg-ember text-foam px-5 pt-8 pb-7">
        <p className="inline-flex items-center gap-2 rounded-full border border-foam/25 px-3 py-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Ishga qabul ochiq
        </p>
        <h1 className="mt-4 font-poster uppercase font-bold leading-[0.95] text-[2.4rem]">Qayerda ishlamoqchisiz?</h1>
        <p className="mt-3 text-foam/80">Bir nechta filialga barista qidiryapmiz. Birini tanlang.</p>
      </header>
      <ul className="px-5 py-6 space-y-3">
        {rounds.map((r) => (
          <li key={r.id}>
            <button onClick={() => onPick(r.id)} className="card w-full p-4 text-left flex items-center gap-3 hover:border-ember/40 transition-colors">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-lg">{r.content.branchName}</span>
                {rounds.some((o) => o.id !== r.id && o.content.branchName === r.content.branchName) && (
                  <span className="block text-sm text-bean/55">{r.name}</span>
                )}
                {r.content.branchAddress && (
                  <span className="mt-0.5 flex gap-1.5 text-sm text-bean/65">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {r.content.branchAddress}
                  </span>
                )}
                {r.content.facts.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {r.content.facts.slice(0, 3).map((f, i) => (
                      <span key={i} className="rounded-full bg-foam px-2.5 py-0.5 text-xs">
                        {f.label}: <b>{f.value}</b>
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <ChevronRight className="w-5 h-5 shrink-0 text-bean/40" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Centered({ title, text, loading, action }: { title?: string; text?: string; loading?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <span className="w-14 h-14 rounded-full bg-ember text-foam flex items-center justify-center">
        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Coffee className="w-6 h-6" />}
      </span>
      {title && <h1 className="mt-5 font-poster uppercase text-3xl font-bold">{title}</h1>}
      {text && <p className="mt-2 max-w-xs text-bean/70 leading-relaxed">{text}</p>}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-6">
          {action.label}
        </button>
      )}
    </main>
  );
}
