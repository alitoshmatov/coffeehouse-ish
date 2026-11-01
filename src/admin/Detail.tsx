import { useState } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, CalendarCheck, CheckCircle2, Loader2, Phone, RotateCcw, Send, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatInterview, formatStamp } from "@/shared/format";
import { interviewMessage, MESSAGE_LIMIT, rejectMessage, trialMessage } from "@/shared/messages";
import type { Application, Status } from "@/shared/types";
import { StatusBadge } from "@/ui/StatusBadge";

type Mode = "idle" | "interview" | "trial" | "reject";
type DecisionRes = { application: Application; delivered: boolean | null };


/** Tomorrow in Tashkent time, as yyyy-mm-dd. */
function tomorrow() {
  const t = new Date(Date.now() + 5 * 3600_000 + 24 * 3600_000);
  return t.toISOString().slice(0, 10);
}
const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

export function Detail({
  application: a,
  defaultPlace: DEFAULT_PLACE,
  onBack,
  onChange,
}: {
  application: Application;
  defaultPlace: string;
  onBack: () => void;
  onChange: (a: Application) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [date, setDate] = useState(a.interviewAt?.slice(0, 10) ?? tomorrow());
  const [time, setTime] = useState(a.interviewAt?.slice(11, 16) ?? "10:00");
  const [place, setPlace] = useState(a.interviewPlace ?? "");
  const [trialDate, setTrialDate] = useState(a.trialStartAt?.slice(0, 10) ?? tomorrow());
  const [trialTime, setTrialTime] = useState(a.trialStartAt?.slice(11, 16) ?? "05:00");
  // Edited text of "Nomzod ko‘radigan xabar"; null = follow the standard text (updates with date/place)
  const [custom, setCustom] = useState<string | null>(null);
  const [editedFrom, setEditedFrom] = useState<string | null>(null); // standard text at the moment of the first edit
  const [note, setNote] = useState(a.internalNote ?? "");
  const [noteSaved, setNoteSaved] = useState(true);

  const template =
    mode === "interview"
      ? interviewMessage({ fullName: a.fullName, interviewAt: `${date}T${time}`, place: place.trim() || DEFAULT_PLACE })
      : mode === "trial"
        ? trialMessage({ fullName: a.fullName, trialStartAt: `${trialDate}T${trialTime}`, branch: DEFAULT_PLACE })
        : rejectMessage({ fullName: a.fullName, duringTrial: a.status === "trial" });
  const message = custom ?? template;
  const edited = custom !== null && custom !== template;
  const stale = edited && editedFrom !== null && editedFrom !== template; // date/place changed after editing
  const editMessage = (v: string) => {
    if (custom === null) setEditedFrom(template);
    setCustom(v);
  };
  const resetMessage = () => {
    setCustom(null);
    setEditedFrom(null);
  };
  const openForm = (m: Mode) => {
    resetMessage();
    setError("");
    setMode(m);
  };

  async function decide(status: Status) {
    if (status !== "new" && !message.trim()) {
      setError("Xabar matni bo‘sh bo‘lmasin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body =
        status === "interview"
          ? { status, interviewAt: `${date}T${time}`, interviewPlace: place, message }
          : status === "trial"
            ? { status, trialStartAt: `${trialDate}T${trialTime}`, message }
            : status === "rejected"
              ? { status, message }
              : { status };
      const r = await api<DecisionRes>(`/api/admin/applications/${a.id}/decision`, { body });
      onChange(r.application);
      setMode("idle");
      resetMessage();
      setFlash(
        r.delivered === null
          ? { ok: true, text: "Ariza “Yangi” holatiga qaytarildi." }
          : r.delivered
            ? { ok: true, text: "Nomzodga Telegram orqali xabar yuborildi." }
            : { ok: false, text: "Holat saqlandi, lekin xabar yetib bormadi (nomzod botni bloklagan bo‘lishi mumkin). Telefon orqali bog‘laning." },
      );
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      const r = await api<DecisionRes>(`/api/admin/applications/${a.id}/resend`, { method: "POST" });
      onChange(r.application);
      setFlash(r.delivered ? { ok: true, text: "Xabar yuborildi." } : { ok: false, text: "Xabar yana yetib bormadi. Telefon orqali bog‘laning." });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (noteSaved) return;
    try {
      const r = await api<{ application: Application }>(`/api/admin/applications/${a.id}/note`, { body: { note } });
      onChange(r.application);
      setNoteSaved(true);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const tgLink = a.tgUsername ? `https://t.me/${a.tgUsername}` : `tg://user?id=${a.tgId}`;
  const first = a.fullName.split(/\s+/)[0];

  return (
    <article className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <button onClick={onBack} className="lg:hidden mb-3 inline-flex items-center gap-1.5 text-sm text-ember">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Ro‘yxatga qaytish
        </button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <h2 className="text-xl font-semibold">{a.fullName}</h2>
            <p className="text-sm text-bean/60">
              #{a.id} · {a.age} yosh · {formatStamp(a.createdAt)}
            </p>
          </div>
          <StatusBadge status={a.status} long />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="btn-ghost h-10 px-4 text-sm">
            <Phone className="w-4 h-4" aria-hidden /> {a.phone}
          </a>
          <a href={tgLink} target="_blank" rel="noreferrer" className="btn-ghost h-10 px-4 text-sm">
            <Send className="w-4 h-4" aria-hidden /> {a.tgUsername ? `@${a.tgUsername}` : "Telegram"}
          </a>
        </div>
      </div>

      {flash && (
        <p className={`flex gap-2 px-5 py-3 text-sm ${flash.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`} role="status">
          {flash.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          {flash.text}
        </p>
      )}

      <dl className="px-5 py-4 space-y-4">
        <Answer label="Hozir nima bilan band" value={a.currentDuties} />
        <Answer label="Tajribasi va o‘zi haqida" value={a.experience} />
        <Answer label="Nega Coffee House" value={a.whyUs} />
      </dl>

      {a.status !== "new" && (
        <div className="mx-5 mb-4 rounded-xl bg-foam/50 px-4 py-3 text-sm">
          {a.status === "trial" && a.trialStartAt && (
            <p className="font-semibold">Sinov muddati boshlanishi: {formatInterview(a.trialStartAt)}</p>
          )}
          {a.status === "trial" && a.interviewAt && (
            <p className="text-bean/60">Suhbat bo‘lgan: {formatInterview(a.interviewAt)}</p>
          )}
          {a.status === "interview" && a.interviewAt && (
            <p className="font-semibold">
              Suhbat: {formatInterview(a.interviewAt)}
            </p>
          )}
          {a.status === "interview" && <p className="text-bean/70">{a.interviewPlace || DEFAULT_PLACE}</p>}
          {(a.sentMessage || a.managerNote) && (
            <details className="mt-2 group">
              <summary className="cursor-pointer select-none text-bean/65 hover:text-bean">Yuborilgan xabarni ko‘rish</summary>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white p-3 text-bean/80 leading-relaxed">{a.sentMessage ?? a.managerNote}</p>
            </details>
          )}
          {a.status === "interview" && (
            <p
              className={`mt-2 rounded-lg px-3 py-2 font-medium ${
                a.interviewResponse === "confirmed"
                  ? "bg-emerald-100 text-emerald-900"
                  : a.interviewResponse === "reschedule"
                    ? "bg-amber-100 text-amber-950"
                    : "bg-white text-bean/60"
              }`}
            >
              {a.interviewResponse === "confirmed" && "✓ Nomzod kelishini tasdiqladi"}
              {a.interviewResponse === "reschedule" && (
                <>
                  🕒 Nomzod boshqa vaqt so‘radi
                  {a.responseNote && <span className="block font-normal">“{a.responseNote}”</span>}
                </>
              )}
              {!a.interviewResponse && "Nomzod hali javob bermadi"}
              {a.respondedAt && <span className="block text-xs font-normal opacity-70">{formatStamp(a.respondedAt)}</span>}
            </p>
          )}
          {a.decidedBy && (
            <p className="mt-1 text-xs text-bean/55">
              Qaror: {a.decidedBy} · {formatStamp(a.updatedAt)}
            </p>
          )}
          <p className={`mt-1 flex flex-wrap items-center gap-x-3 ${a.notified ? "text-emerald-700" : "text-amber-700"}`}>
            {a.notified ? "✓ Nomzodga xabar yuborilgan" : "Nomzodga xabar yetib bormagan"}
            {!a.notified && (
              <button onClick={resend} disabled={busy} className="font-semibold underline underline-offset-2">
                Qayta yuborish
              </button>
            )}
          </p>
        </div>
      )}

      <div className="px-5 pb-4">
        <label htmlFor="note" className="mb-1.5 block text-sm font-medium">
          Ichki izoh <span className="font-normal text-bean/50">(faqat menejerlar ko‘radi)</span>
        </label>
        <textarea
          id="note"
          rows={2}
          className="field resize-none text-sm"
          placeholder="Masalan: qo‘ng‘iroq qildim, ertaga kela oladi"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteSaved(false);
          }}
          onBlur={saveNote}
        />
        {!noteSaved && <p className="mt-1 text-xs text-bean/50">Maydondan chiqqanda saqlanadi</p>}
      </div>

      <div className="border-t border-line bg-cream/60 px-5 py-4">
        {mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            {(a.status === "interview" || a.status === "trial") && (
              <button
                onClick={() => openForm("trial")}
                className={`${a.status === "interview" && a.interviewResponse !== "reschedule" ? "btn-primary" : "btn-ghost"} flex-auto whitespace-nowrap`}
              >
                <BadgeCheck className="w-4 h-4" aria-hidden /> {a.status === "trial" ? "Boshlanish sanasini o‘zgartirish" : "Sinov muddatiga qabul qilish"}
              </button>
            )}
            {(a.status === "new" || a.status === "rejected") && (
              <button onClick={() => openForm("interview")} className="btn-primary flex-auto whitespace-nowrap">
                <CalendarCheck className="w-4 h-4" aria-hidden /> Suhbatga taklif qilish
              </button>
            )}
            {a.status === "interview" && (
              <button
                onClick={() => openForm("interview")}
                className={`${a.interviewResponse === "reschedule" ? "btn-primary" : "btn-ghost"} flex-auto whitespace-nowrap`}
              >
                <CalendarCheck className="w-4 h-4" aria-hidden /> {a.interviewResponse === "reschedule" ? "Yangi vaqt belgilash" : "Vaqtni o‘zgartirish"}
              </button>
            )}
            {a.status !== "rejected" && (
              <button onClick={() => openForm("reject")} className="btn-ghost flex-auto whitespace-nowrap text-red-700">
                <X className="w-4 h-4" aria-hidden /> Rad etish
              </button>
            )}
            {a.status !== "new" && (
              <button onClick={() => decide("new")} disabled={busy} className="btn h-12 px-4 text-sm text-bean/60 hover:text-bean">
                <RotateCcw className="w-4 h-4" aria-hidden /> Yangiga qaytarish
              </button>
            )}
          </div>
        )}

        {mode === "interview" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              decide("interview");
            }}
            className="space-y-3"
          >
            <h3 className="font-semibold">Suhbatga taklif</h3>
            {a.interviewResponse === "reschedule" && a.responseNote && (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950">
                Nomzod so‘ragan vaqt: “{a.responseNote}”
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Sana</span>
                <input type="date" required min={todayTashkent()} value={date} onChange={(e) => setDate(e.target.value)} className="field py-2.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Vaqt</span>
                <input type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} className="field py-2.5" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                  Manzil <span className="font-normal text-bean/50">(bo‘sh qolsa — filial manzili)</span>
                </span>
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={DEFAULT_PLACE} maxLength={200} className="field py-2.5" />
            </label>
            <MessageBox value={message} edited={edited} stale={stale} onChange={editMessage} onReset={resetMessage}>
              <span className="flex flex-wrap gap-1.5 text-xs">
                Xabar ostida tugmalar:
                <span className="rounded-md border border-line bg-white px-2 py-0.5">✅ Kelaman</span>
                <span className="rounded-md border border-line bg-white px-2 py-0.5">🕒 Boshqa vaqt so‘rash</span>
              </span>
            </MessageBox>
            <Actions busy={busy} error={error} onCancel={() => setMode("idle")} label="Taklif yuborish" />
          </form>
        )}

        {mode === "trial" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              decide("trial");
            }}
            className="space-y-3"
          >
            <h3 className="font-semibold">Sinov muddatiga qabul qilish (30 kun)</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Birinchi ish kuni</span>
                <input type="date" required min={todayTashkent()} value={trialDate} onChange={(e) => setTrialDate(e.target.value)} className="field py-2.5" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Kelish vaqti</span>
                <input type="time" required step={900} value={trialTime} onChange={(e) => setTrialTime(e.target.value)} className="field py-2.5" />
              </label>
            </div>
            <MessageBox value={message} edited={edited} stale={stale} onChange={editMessage} onReset={resetMessage} />
            <Actions busy={busy} error={error} onCancel={() => setMode("idle")} label="Qabul qilish va xabar yuborish" />
          </form>
        )}

        {mode === "reject" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              decide("rejected");
            }}
            className="space-y-3"
          >
            <h3 className="font-semibold">{a.status === "trial" ? "Sinov muddatini to‘xtatish" : "Arizani rad etish"}</h3>
            <MessageBox value={message} edited={edited} stale={stale} onChange={editMessage} onReset={resetMessage} />
            <Actions busy={busy} error={error} onCancel={() => setMode("idle")} label="Rad etish va xabar yuborish" danger />
          </form>
        )}

        {mode === "idle" && error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </article>
  );
}

function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-bean/50">{label}</dt>
      <dd className={`mt-1 whitespace-pre-wrap leading-relaxed ${value ? "" : "text-bean/40"}`}>{value || "Yozilmagan"}</dd>
    </div>
  );
}

/** Editable text of the bot message the candidate will receive. */
function MessageBox({
  value,
  edited,
  stale,
  onChange,
  onReset,
  children,
}: {
  value: string;
  edited: boolean;
  stale?: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="candidate-message" className="text-xs font-medium uppercase tracking-wider text-bean/55">
          Nomzod ko‘radigan xabar
        </label>
        {edited ? (
          <button type="button" onClick={onReset} className="text-xs font-medium text-ember underline underline-offset-2">
            Standart matnga qaytarish
          </button>
        ) : (
          <span className="text-xs text-bean/45">Tahrirlash mumkin</span>
        )}
      </div>
      <textarea
        id="candidate-message"
        rows={Math.min(14, Math.max(6, value.split("\n").length + 1))}
        maxLength={MESSAGE_LIMIT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field resize-y py-2.5 text-sm leading-relaxed"
      />
      {stale && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" role="status">
          Sana, vaqt yoki manzilni o‘zgartirdingiz — tahrirlangan matnda ular avtomatik yangilanmaydi. Matnni tekshiring yoki
          standart matnga qayting.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-bean/50">
        <span>{children ?? (edited ? "O‘zgartirilgan matn yuboriladi." : "Sana va manzilni o‘zgartirsangiz, matn ham yangilanadi.")}</span>
        <span className="tabular-nums">
          {value.length}/{MESSAGE_LIMIT}
        </span>
      </div>
    </div>
  );
}

function Actions({ busy, error, onCancel, label, danger }: { busy: boolean; error: string; onCancel: () => void; label: string; danger?: boolean }) {
  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Bekor qilish
        </button>
        <button disabled={busy} className={`btn h-12 flex-1 text-white ${danger ? "bg-red-700 hover:bg-red-800" : "bg-ember hover:bg-ember-dark"}`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {label}
        </button>
      </div>
    </div>
  );
}
