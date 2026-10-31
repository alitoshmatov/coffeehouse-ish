import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatStamp } from "@/shared/format";
import { CONTENT_LIMITS as L, DEFAULT_CONTENT, type JobContent } from "@/shared/hiring";
import { JobIntro } from "@/applicant/JobIntro";

type Meta = { editedBy: string; editedAt: string } | null;
type Res = { content: JobContent; meta: Meta };

export function ContentEditor({ onLogout }: { onLogout: () => void }) {
  const [saved, setSaved] = useState<JobContent | null>(null);
  const [draft, setDraft] = useState<JobContent | null>(null);
  const [meta, setMeta] = useState<Meta>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<Res>("/api/admin/content")
      .then((r) => {
        setSaved(r.content);
        setDraft(r.content);
        setMeta(r.meta);
      })
      .catch((e: ApiError) => (e.status === 401 ? onLogout() : setError(e.message)));
  }, [onLogout]);

  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!draft)
    return (
      <div className="py-20 flex justify-center">
        {error ? <p className="text-red-600">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-ember" />}
      </div>
    );

  const set = <K extends keyof JobContent>(k: K, v: JobContent[K]) => {
    setDraft({ ...draft, [k]: v });
    setDone(false);
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Res>("/api/admin/content", { method: "PUT", body: { content: draft } });
      setSaved(r.content);
      setDraft(r.content);
      setMeta(r.meta);
      setDone(true);
    } catch (e) {
      if ((e as ApiError).status === 401) onLogout();
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-poster uppercase text-2xl font-bold">Ish shartlari</h1>
            <p className="text-sm text-bean/60">
              Nomzodlar ilovada ko‘radigan matn.
              {meta && ` Oxirgi o‘zgartirish: ${meta.editedBy}, ${formatStamp(meta.editedAt)}.`}
            </p>
          </div>
          <button
            onClick={() => confirm("Standart matnni yuklaysizmi? Saqlamaguningizcha hech narsa o‘zgarmaydi.") && setDraft(DEFAULT_CONTENT)}
            className="text-sm text-bean/55 underline underline-offset-2 hover:text-bean"
          >
            Standart matnni yuklash
          </button>
        </div>

        <Section title="Sarlavha">
          <Input label="Sarlavha" value={draft.title} max={L.title} onChange={(v) => set("title", v)} />
          <Text label="Kirish matni" value={draft.intro} max={L.text} onChange={(v) => set("intro", v)} />
        </Section>

        <Section title="Filial" hint="Bot xabarlarida va suhbat manzilida ishlatiladi.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Filial nomi" value={draft.branchName} max={L.title} onChange={(v) => set("branchName", v)} />
            <Input label="Manzil" value={draft.branchAddress} max={L.text} onChange={(v) => set("branchAddress", v)} />
          </div>
        </Section>

        <Section title="Qisqa ma’lumotlar" hint={`Sarlavha ostidagi kartochkalar. Ko‘pi bilan ${L.facts} ta.`}>
          <ListEditor
            items={draft.facts}
            max={L.facts}
            onChange={(v) => set("facts", v)}
            blank={{ label: "", value: "" }}
            addLabel="Ma’lumot qo‘shish"
            render={(f, update) => (
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <input aria-label="Nomi" className="field py-2" placeholder="Masalan: Oylik" maxLength={L.short} value={f.label} onChange={(e) => update({ ...f, label: e.target.value })} />
                <input aria-label="Qiymati" className="field py-2" placeholder="Masalan: 2 500 000 so‘m" maxLength={L.short} value={f.value} onChange={(e) => update({ ...f, value: e.target.value })} />
              </div>
            )}
          />
        </Section>

        <Section title="Biz taklif qilamiz">
          <ListEditor
            items={draft.offer}
            max={L.items}
            onChange={(v) => set("offer", v)}
            blank={{ title: "", text: "" }}
            addLabel="Band qo‘shish"
            render={(o, update) => (
              <div className="flex-1 space-y-2">
                <input aria-label="Sarlavha" className="field py-2 font-semibold" placeholder="Sarlavha" maxLength={L.title} value={o.title} onChange={(e) => update({ ...o, title: e.target.value })} />
                <textarea aria-label="Tavsif" rows={2} className="field resize-none py-2 text-sm" placeholder="Tavsif (ixtiyoriy)" maxLength={L.text} value={o.text} onChange={(e) => update({ ...o, text: e.target.value })} />
              </div>
            )}
          />
        </Section>

        <Section title="Sizdan kutamiz">
          <ListEditor
            items={draft.expect}
            max={L.items}
            onChange={(v) => set("expect", v)}
            blank=""
            addLabel="Talab qo‘shish"
            render={(t, update) => (
              <textarea aria-label="Talab" rows={2} className="field flex-1 resize-none py-2 text-sm" maxLength={L.text} value={t} onChange={(e) => update(e.target.value)} />
            )}
          />
        </Section>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-bean/50">Nomzod shunday ko‘radi</p>
          <div className="h-[calc(100dvh-7rem)] overflow-y-auto rounded-[2rem] border-[6px] border-bean bg-cream shadow-xl">
            <div className="pointer-events-none select-none" aria-hidden>
              <JobIntro content={draft} preview />
            </div>
          </div>
        </div>
      </aside>

      {(dirty || done || error) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
            <p className={`mr-auto text-sm ${error ? "text-red-600" : done && !dirty ? "text-emerald-700" : "text-bean/70"}`} role="status">
              {error ||
                (done && !dirty ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Saqlandi — nomzodlar yangi matnni ko‘radi
                  </span>
                ) : (
                  "Saqlanmagan o‘zgarishlar bor"
                ))}
            </p>
            {dirty && (
              <>
                <button onClick={() => { setDraft(saved); setError(""); }} className="btn-ghost h-10">
                  Bekor qilish
                </button>
                <button onClick={save} disabled={busy} className="btn-primary h-10">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Saqlash
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-5 card p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-sm text-bean/55">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Input({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input className="field py-2.5" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Text({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <textarea rows={2} className="field resize-none py-2.5" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ListEditor<T>({
  items,
  max,
  blank,
  addLabel,
  onChange,
  render,
}: {
  items: T[];
  max: number;
  blank: T;
  addLabel: string;
  onChange: (v: T[]) => void;
  render: (item: T, update: (v: T) => void) => ReactNode;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-bean/40">{i + 1}</span>
          {render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <div className="flex shrink-0 flex-col">
            <IconBtn label="Yuqoriga" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Pastga" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="w-4 h-4" />
            </IconBtn>
          </div>
          <IconBtn label="O‘chirish" onClick={() => onChange(items.filter((_, j) => j !== i))} danger>
            <Trash2 className="w-4 h-4" />
          </IconBtn>
        </div>
      ))}
      {items.length < max && (
        <button onClick={() => onChange([...items, blank])} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ember hover:bg-foam/60">
          <Plus className="w-4 h-4" aria-hidden /> {addLabel}
        </button>
      )}
    </>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-25 ${danger ? "text-red-600 hover:bg-red-50" : "text-bean/50 hover:bg-foam/60 hover:text-bean"}`}
    >
      {children}
    </button>
  );
}
