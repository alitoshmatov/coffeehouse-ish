import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock4, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { LIMITS, type InterviewResponse, type MyApplication } from "@/shared/types";

/** Lets the applicant confirm the interview or ask for another time. */
export function InterviewReply({
  application: a,
  startWithReschedule,
  onUpdate,
}: {
  application: MyApplication;
  startWithReschedule?: boolean;
  onUpdate: (a: MyApplication) => void;
}) {
  const [asking, setAsking] = useState(!!startWithReschedule && a.interviewResponse !== "reschedule");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<InterviewResponse | null>(null);
  const [error, setError] = useState("");

  async function send(response: InterviewResponse) {
    setBusy(response);
    setError("");
    try {
      const r = await api<{ application: MyApplication }>("/api/interview/respond", {
        body: { response, note: response === "reschedule" ? note : undefined },
      });
      haptic("success");
      setAsking(false);
      setNote("");
      onUpdate(r.application);
    } catch (e) {
      haptic("error");
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  if (asking)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send("reschedule");
        }}
        className="mt-4 card p-5"
      >
        <label htmlFor="reschedule" className="font-semibold">
          Qaysi kun va vaqt sizga qulay?
        </label>
        <p className="mt-1 text-sm text-bean/60">Menejer yangi vaqtni shu bot orqali yuboradi.</p>
        <textarea
          id="reschedule"
          autoFocus
          rows={3}
          maxLength={LIMITS.responseNote}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Masalan: 4-noyabr, 15:00 dan keyin yoki shanba kuni ertalab"
          className="field mt-3 resize-none"
        />
        {error && <ErrorLine text={error} />}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setAsking(false)} className="btn-ghost">
            Bekor qilish
          </button>
          <button disabled={!!busy || note.trim().length < 3} className="btn-primary flex-1">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} So‘rov yuborish
          </button>
        </div>
      </form>
    );

  if (a.interviewResponse === "confirmed")
    return (
      <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
        <p className="flex gap-2 font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden /> Kelishingizni tasdiqladingiz
        </p>
        <button onClick={() => setAsking(true)} className="mt-2 text-sm font-medium underline underline-offset-2">
          Boshqa vaqt kerak bo‘lib qoldimi?
        </button>
      </div>
    );

  if (a.interviewResponse === "reschedule")
    return (
      <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-950">
        <p className="flex gap-2 font-semibold">
          <Clock4 className="w-5 h-5 shrink-0" aria-hidden /> Boshqa vaqt so‘radingiz
        </p>
        {a.responseNote && <p className="mt-1 text-sm">“{a.responseNote}”</p>}
        <p className="mt-1 text-sm text-amber-900/80">Menejer yangi vaqtni shu bot orqali yuboradi.</p>
        {error && <ErrorLine text={error} />}
        <button onClick={() => send("confirmed")} disabled={!!busy} className="mt-2 text-sm font-medium underline underline-offset-2">
          {busy ? "Yuborilmoqda…" : "Belgilangan vaqtda kela olaman"}
        </button>
      </div>
    );

  return (
    <div className="mt-4 card p-5">
      <p className="font-semibold">Belgilangan vaqtda kela olasizmi?</p>
      {error && <ErrorLine text={error} />}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => send("confirmed")} disabled={!!busy} className="btn-primary px-3">
          {busy === "confirmed" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Kelaman
        </button>
        <button onClick={() => setAsking(true)} disabled={!!busy} className="btn-ghost px-3 whitespace-nowrap text-[15px]">
          Boshqa vaqt kerak
        </button>
      </div>
    </div>
  );
}

const ErrorLine = ({ text }: { text: string }) => (
  <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden /> {text}
  </p>
);
