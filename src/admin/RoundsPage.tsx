import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, MapPin, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatStamp } from "@/shared/format";
import type { Round, RoundSummary } from "@/shared/types";
import { StorageWarning } from "./StorageWarning";

/** List of hiring rounds ("Qabullar") with per-status counts. */
export function RoundsPage({ onOpen, onLogout }: { onOpen: (id: number) => void; onLogout: () => void }) {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ rounds: RoundSummary[]; storageWarning: string | null }>("/api/admin/rounds");
      setRounds(r.rounds);
      setStorage(r.storageWarning);
    } catch (e) {
      if ((e as ApiError).status === 401) onLogout();
      else setError((e as ApiError).message);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  const openCount = rounds?.filter((r) => r.open).length ?? 0;

  return (
    <>
      <StorageWarning path={storage} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-poster uppercase text-2xl font-bold">Qabullar</h1>
            <p className="text-sm text-bean/60">
              Har bir qabulning o‘z ish shartlari va arizalari bor.{" "}
              {rounds && (openCount ? `Hozir ${openCount} ta qabul ochiq.` : "Hozir ochiq qabul yo‘q — nomzodlar ariza topshira olmaydi.")}
            </p>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)} className="btn-primary">
              <Plus className="w-4 h-4" aria-hidden /> Yangi qabul
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        {creating && rounds && <NewRound rounds={rounds} onCancel={() => setCreating(false)} onCreated={(r) => onOpen(r.id)} />}

        {!rounds ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-ember" />
          </div>
        ) : rounds.length === 0 ? (
          <p className="mt-6 card p-10 text-center text-bean/60">Hali qabul yo‘q. “Yangi qabul” tugmasini bosing.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {rounds.map((r) => {
              const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
              return (
                <li key={r.id}>
                  <a
                    href={`/admin/q/${r.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpen(r.id);
                    }}
                    className="card p-4 sm:p-5 flex items-center gap-4 hover:border-ember/40 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold">{r.name}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            r.open ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${r.open ? "bg-emerald-500" : "bg-stone-500"}`} />
                          {r.open ? "Ochiq" : "Yopiq"}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm text-bean/60">
                        <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden /> {r.content.branchName}
                        <span className="text-bean/35">·</span> {formatStamp(r.createdAt)}
                        {r.createdBy && (
                          <span className="hidden sm:inline">
                            <span className="text-bean/35">·</span> {r.createdBy}
                          </span>
                        )}
                      </span>
                      <span className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                        <Count label="Yangi" n={r.counts.new} strong />
                        <Count label="Suhbat" n={r.counts.interview} dot={r.rescheduleRequests > 0} />
                        <Count label="Sinov" n={r.counts.trial} />
                        <Count label="Rad" n={r.counts.rejected} />
                        <span className="px-1 py-0.5 text-bean/45">Jami {total}</span>
                      </span>
                    </span>
                    <ChevronRight className="w-5 h-5 shrink-0 text-bean/35" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Count({ label, n, strong, dot }: { label: string; n: number; strong?: boolean; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${strong && n > 0 ? "bg-amber-100 text-amber-900 font-semibold" : "bg-foam/70 text-bean/75"}`}>
      {label} <b className="tabular-nums">{n}</b>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Boshqa vaqt so‘raganlar bor" />}
    </span>
  );
}

function NewRound({ rounds, onCreated, onCancel }: { rounds: RoundSummary[]; onCreated: (r: Round) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>(rounds[0] ? String(rounds[0].id) : "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ round: Round }>("/api/admin/rounds", { body: { name, copyFrom: copyFrom ? Number(copyFrom) : null, open } });
      onCreated(r.round);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 card p-5 space-y-4">
      <h2 className="font-semibold">Yangi qabul</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nomi</span>
        <input required autoFocus maxLength={80} className="field py-2.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Qorabog‘ — Noyabr 2026" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Ish shartlari</span>
        <select className="field py-2.5" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              “{r.name}” dan nusxa olish
            </option>
          ))}
          <option value="">Standart matndan boshlash</option>
        </select>
        <span className="mt-1 block text-bean/55">Keyin “Ish shartlari” bo‘limida o‘zgartirasiz.</span>
      </label>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="h-4 w-4 accent-[#71292A]" />
        Darhol ariza qabul qilishni boshlash
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost h-10">
          Bekor qilish
        </button>
        <button disabled={busy || !name.trim()} className="btn-primary h-10">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Yaratish
        </button>
      </div>
    </form>
  );
}
