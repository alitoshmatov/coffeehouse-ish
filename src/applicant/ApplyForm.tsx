import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Loader2, Phone } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ensureWriteAccess, haptic, requestPhone, tg } from "@/lib/telegram";
import { LIMITS, validateInput, type ApplicationInput, type MyApplication } from "@/shared/types";
import { BottomBar } from "./BottomBar";

type Draft = { fullName: string; phone: string; age: string; currentDuties: string; experience: string; whyUs: string };
type Key = keyof Draft;
const DRAFT_KEY = "ish-draft";
const REQUIRED: Key[] = ["fullName", "phone", "age"];

function initialDraft(): Draft {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    /* storage unavailable */
  }
  const u = tg?.initDataUnsafe.user;
  return {
    fullName: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "",
    phone: "",
    age: "",
    currentDuties: "",
    experience: "",
    whyUs: "",
  };
}

export function ApplyForm({ branchName, onDone }: { branchName: string; onDone: (a: MyApplication) => void }) {
  const [d, setD] = useState<Draft>(initialDraft);
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const [serverFields, setServerFields] = useState<Partial<Record<Key, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable */
    }
  }, [d]);

  const { errors } = validateInput({ ...d, age: d.age === "" ? NaN : Number(d.age) });
  const err = (k: Key) => ((submitted || touched[k]) && (errors as Record<string, string>)[k]) || serverFields[k];
  const set = (k: Key) => (v: string) => {
    setD((p) => ({ ...p, [k]: v }));
    setServerFields((f) => ({ ...f, [k]: undefined }));
  };
  const blur = (k: Key) => () => setTouched((t) => ({ ...t, [k]: true }));

  async function sharePhone() {
    const p = await requestPhone();
    if (p) {
      set("phone")(p);
      haptic("success");
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    setServerErr("");
    const first = [...REQUIRED, "currentDuties", "experience", "whyUs"].find((k) => (errors as Record<string, string>)[k]);
    if (first) {
      haptic("error");
      formRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      await ensureWriteAccess();
      const body: ApplicationInput = { ...d, age: Number(d.age) };
      const { application } = await api<{ application: MyApplication }>("/api/apply", { body });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
      haptic("success");
      onDone(application);
    } catch (e) {
      const ae = e as ApiError;
      haptic("error");
      setServerErr(ae.message);
      if (ae.fields) setServerFields(ae.fields as Partial<Record<Key, string>>);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="px-5 pt-6 pb-32">
      <h1 className="font-poster uppercase text-3xl font-bold">Ariza</h1>
      <p className="mt-1 text-bean/70">
        {branchName} · <span className="text-ember">*</span> majburiy
      </p>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-5">
        <Field id="fullName" label="Ism familiya" required error={err("fullName")}>
          <input
            id="fullName"
            className={`field ${err("fullName") ? "field-error" : ""}`}
            autoComplete="name"
            maxLength={LIMITS.name}
            placeholder="Masalan: Aziza Karimova"
            value={d.fullName}
            onChange={(e) => set("fullName")(e.target.value)}
            onBlur={blur("fullName")}
          />
        </Field>

        <Field id="phone" label="Telefon raqam" required error={err("phone")}>
          <div className="flex gap-2">
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={`field ${err("phone") ? "field-error" : ""}`}
              maxLength={LIMITS.phone}
              placeholder="+998 90 123 45 67"
              value={d.phone}
              onChange={(e) => set("phone")(e.target.value)}
              onBlur={blur("phone")}
            />
            {tg?.requestContact && (
              <button type="button" onClick={sharePhone} className="btn-ghost shrink-0 px-4" aria-label="Telegramdagi raqamni ulashish">
                <Phone className="w-4 h-4" aria-hidden />
                <span className="text-sm">Ulashish</span>
              </button>
            )}
          </div>
        </Field>

        <Field id="age" label="Yoshingiz" required error={err("age")} hint="Kamida 18 yosh.">
          <input
            id="age"
            type="number"
            inputMode="numeric"
            min={LIMITS.minAge}
            max={LIMITS.maxAge}
            className={`field w-32 ${err("age") ? "field-error" : ""}`}
            placeholder="18"
            value={d.age}
            onChange={(e) => set("age")(e.target.value)}
            onBlur={blur("age")}
          />
        </Field>

        <Area id="currentDuties" label="Hozir nima bilan bandsiz?" placeholder="Talabaman, boshqa joyda ishlayman, vaqtincha ishsizman…" value={d.currentDuties} onChange={set("currentDuties")} error={err("currentDuties")} />
        <Area id="experience" label="Tajribangiz va o‘zingiz haqingizda" placeholder="Qayerda ishlagansiz, qachondan ish boshlay olasiz…" value={d.experience} onChange={set("experience")} error={err("experience")} />
        <Area id="whyUs" label="Nega aynan Coffee House?" placeholder="Bir-ikki gap yetarli." value={d.whyUs} onChange={set("whyUs")} error={err("whyUs")} />

        <p className="text-sm text-bean/60 leading-relaxed">
          Yuborish orqali ish shartlari bilan tanishganingizni tasdiqlaysiz. Natijani shu bot orqali xabar qilamiz.
        </p>
      </form>

      <BottomBar>
        {serverErr && (
          <p role="alert" className="mb-2 flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden /> {serverErr}
          </p>
        )}
        <button onClick={() => submit()} disabled={sending} className="btn-primary w-full">
          {sending ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : null}
          {sending ? "Yuborilmoqda…" : "Arizani yuborish"}
        </button>
      </BottomBar>
    </main>
  );
}

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string | false; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label} {required ? <span className="text-ember">*</span> : <span className="font-normal text-bean/50">(ixtiyoriy)</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-bean/55">{hint}</p>
      ) : null}
    </div>
  );
}

function Area({ id, label, placeholder, value, onChange, error }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void; error?: string | false }) {
  return (
    <Field id={id} label={label} error={error}>
      <textarea
        id={id}
        rows={3}
        maxLength={LIMITS.text}
        className={`field resize-none ${error ? "field-error" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-right text-xs text-bean/45 tabular-nums">
        {value.length}/{LIMITS.text}
      </p>
    </Field>
  );
}
