import { CalendarDays, Check, Clock, MapPin, PartyPopper, RefreshCw, X } from "lucide-react";
import { branchLine, type JobContent } from "@/shared/hiring";
import { formatInterview, formatStamp } from "@/shared/format";
import type { MyApplication } from "@/shared/types";
import { BottomBar } from "./BottomBar";
import { InterviewReply } from "./InterviewReply";

type Step = { label: string; state: "done" | "current" | "todo" | "rejected"; note?: string };

export function StatusView({
  application: a,
  content,
  canReapply,
  onReapply,
  onRefresh,
  onUpdate,
  startWithReschedule,
}: {
  application: MyApplication;
  content: JobContent;
  canReapply: boolean;
  onReapply: () => void;
  onRefresh: () => void;
  onUpdate: (a: MyApplication) => void;
  startWithReschedule?: boolean;
}) {
  const steps: Step[] = [
    { label: "Ariza yuborildi", state: "done", note: formatStamp(a.createdAt) },
    { label: "Ko‘rib chiqilmoqda", state: a.status === "new" ? "current" : "done", note: a.status === "new" ? "Odatda 24 soat ichida" : undefined },
    a.status === "rejected"
      ? { label: "Bu safar tanlanmadi", state: "rejected" }
      : {
          label: "Suhbat",
          state: a.status === "interview" ? "current" : a.status === "trial" ? "done" : "todo",
          note:
            a.interviewResponse === "confirmed"
              ? "Kelishingiz tasdiqlangan"
              : a.interviewResponse === "reschedule"
                ? "Yangi vaqt kutilmoqda"
                : undefined,
        },
    ...(a.status === "rejected"
      ? []
      : [
          {
            label: "Sinov muddati (30 kun)",
            state: a.status === "trial" ? "current" : "todo",
            note: a.status === "trial" && a.trialStartAt ? `Boshlanishi: ${formatInterview(a.trialStartAt)}` : undefined,
          } as Step,
        ]),
  ];

  const headline = {
    new: { title: "Arizangiz qabul qilindi", text: "Rahmat! Ko‘rib chiqib, natijani shu bot orqali xabar qilamiz." },
    interview: { title: "Sizni suhbatga kutamiz", text: "Tabriklaymiz! Quyidagi vaqtda filialga keling." },
    trial: {
      title: "Sinov muddatiga qabul qilindingiz",
      text: "Tabriklaymiz! Suhbatdan muvaffaqiyatli o‘tdingiz. Sinov muddatida ham oylik to‘lanadi — ishni yaxshi o‘rgansangiz, doimiy ishga olinasiz.",
    },
    rejected: a.trialStartAt
      ? { title: "Rahmat", text: "Sinov muddatida ishlaganingiz uchun rahmat. Afsuski, hamkorlikni davom ettira olmaymiz." }
      : { title: "Qiziqishingiz uchun rahmat", text: "Afsuski, bu safar boshqa nomzodni tanladik." },
  }[a.status];

  return (
    <main className="px-5 pt-8 pb-32">
      <span
        className={`inline-flex w-14 h-14 items-center justify-center rounded-full ${
          a.status === "rejected" ? "bg-stone-200 text-stone-600" : "bg-ember text-foam"
        }`}
      >
        {a.status === "trial" ? <PartyPopper className="w-7 h-7" /> : a.status === "rejected" ? <X className="w-7 h-7" /> : a.status === "interview" ? <CalendarDays className="w-7 h-7" /> : <Check className="w-7 h-7" strokeWidth={3} />}
      </span>
      <h1 className="mt-5 font-poster uppercase text-[2.2rem] font-bold leading-none">{headline.title}</h1>
      <p className="mt-3 text-bean/75 leading-relaxed">{headline.text}</p>

      {a.status === "interview" && (
        <div className="mt-6 card p-5 space-y-3">
          {a.interviewAt && (
            <p className="flex gap-3">
              <Clock className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
              <span className="font-semibold">{formatInterview(a.interviewAt)}</span>
            </p>
          )}
          <p className="flex gap-3">
            <MapPin className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
            <span>{a.interviewPlace || branchLine(content)}</span>
          </p>
          {a.managerNote && <p className="border-t border-line pt-3 text-bean/80 leading-relaxed">{a.managerNote}</p>}
        </div>
      )}
      {a.status === "trial" && (
        <div className="mt-6 card p-5 space-y-3">
          {a.trialStartAt && (
            <p className="flex gap-3">
              <CalendarDays className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
              <span>
                <span className="block text-sm text-bean/60">Birinchi ish kuni</span>
                <span className="font-semibold">{formatInterview(a.trialStartAt)}</span>
              </span>
            </p>
          )}
          <p className="flex gap-3">
            <MapPin className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
            <span>{branchLine(content)}</span>
          </p>
          {a.managerNote && <p className="border-t border-line pt-3 text-bean/80 leading-relaxed">{a.managerNote}</p>}
        </div>
      )}
      {a.status === "interview" && (
        <InterviewReply application={a} startWithReschedule={startWithReschedule} onUpdate={onUpdate} />
      )}
      {a.status === "rejected" && a.managerNote && <p className="mt-4 card p-4 text-bean/80 leading-relaxed">{a.managerNote}</p>}

      <ol className="mt-8 space-y-0">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[11px] top-7 bottom-1 w-0.5 bg-line" aria-hidden />}
            <span
              className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                s.state === "done"
                  ? "border-ember bg-ember text-foam"
                  : s.state === "current"
                    ? "border-ember bg-white"
                    : s.state === "rejected"
                      ? "border-stone-400 bg-stone-200 text-stone-600"
                      : "border-line bg-white"
              }`}
            >
              {s.state === "done" && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              {s.state === "current" && <span className="h-2 w-2 rounded-full bg-ember" />}
              {s.state === "rejected" && <X className="w-3.5 h-3.5" strokeWidth={3} />}
            </span>
            <span>
              <span className={`block font-semibold ${s.state === "todo" ? "text-bean/45" : ""}`}>{s.label}</span>
              {s.note && <span className="block text-sm text-bean/60">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>

      <BottomBar>
        {canReapply ? (
          <button onClick={onReapply} className="btn-primary w-full">
            Yangi ariza topshirish
          </button>
        ) : (
          <button onClick={onRefresh} className="btn-ghost w-full">
            <RefreshCw className="w-4 h-4" aria-hidden /> Holatni yangilash
          </button>
        )}
      </BottomBar>
    </main>
  );
}
