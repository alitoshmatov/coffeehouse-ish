/** Red bar shown when the database is not on a persistent volume (data lost on redeploy). */
export const StorageWarning = ({ path }: { path: string | null }) =>
  path ? (
    <div className="bg-red-700 text-white" role="alert">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 text-sm leading-relaxed">
        <b>Diqqat: ma’lumotlar har deploy’da o‘chib ketadi.</b> Baza ({path}) doimiy diskda emas. Coolify → Persistent
        Storage → Volume qo‘shing, manzil: <code className="font-mono">/data</code>, va <code className="font-mono">DB_PATH</code>{" "}
        o‘zgaruvchisini o‘chiring. Keyin Redeploy.
      </div>
    </div>
  ) : null;

/** On/off switch used for a round's "accepting applications" state. */
export function OpenSwitch({ open, onToggle, disabled }: { open: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={open}
      className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm hover:bg-foam/50 disabled:opacity-60"
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${open ? "bg-emerald-500" : "bg-stone-300"}`} aria-hidden>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${open ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {open ? "Ariza qabuli ochiq" : "Ariza qabuli yopiq"}
    </button>
  );
}
