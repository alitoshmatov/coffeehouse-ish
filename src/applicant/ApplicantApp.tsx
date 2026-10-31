import { useCallback, useEffect, useState } from "react";
import { Coffee, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { tg } from "@/lib/telegram";
import type { MyApplication } from "@/shared/types";
import { JobIntro } from "./JobIntro";
import { ApplyForm } from "./ApplyForm";
import { StatusView } from "./StatusView";

type Screen = "intro" | "form" | "status";
type Me = { hiringOpen: boolean; application: MyApplication | null };

// The bot's "Boshqa vaqt so‘rash" button opens the app with ?reschedule=1
const startWithReschedule = new URLSearchParams(window.location.search).has("reschedule");

export default function ApplicantApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>("intro");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api<Me>("/api/me");
      setMe(data);
      setScreen(data.application ? "status" : "intro");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);

  useEffect(() => {
    if (tg) load();
  }, [load]);

  // Telegram's native back button mirrors in-app navigation
  useEffect(() => {
    if (!tg) return;
    const back = () => setScreen("intro");
    if (screen === "form") {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    } else tg.BackButton.hide();
    return () => tg?.BackButton.offClick(back);
  }, [screen]);

  if (!tg) return <Centered title="Ilovani Telegram orqali oching" text="Ariza topshirish uchun Coffee House botidagi “Ariza” tugmasini bosing." />;
  if (error) return <Centered title="Ulanib bo‘lmadi" text={error} action={{ label: "Qayta urinish", onClick: load }} />;
  if (!me) return <Centered loading />;

  if (screen === "status" && me.application)
    return (
      <StatusView
        application={me.application}
        canReapply={me.hiringOpen && me.application.status === "rejected"}
        onReapply={() => setScreen("intro")}
        onRefresh={load}
        onUpdate={(application) => setMe({ ...me, application })}
        startWithReschedule={startWithReschedule}
      />
    );

  if (!me.hiringOpen)
    return <Centered title="Hozircha ishga qabul yopiq" text="Yangi o‘rin ochilganda shu bot orqali xabar beramiz. Qiziqishingiz uchun rahmat!" />;

  if (screen === "form")
    return (
      <ApplyForm
        onDone={(application) => {
          setMe({ ...me, application });
          setScreen("status");
          window.scrollTo(0, 0);
        }}
      />
    );

  return <JobIntro onApply={() => { setScreen("form"); window.scrollTo(0, 0); }} />;
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
