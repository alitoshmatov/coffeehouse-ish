import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Lock, Trash2, Unlock, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatStamp } from "@/shared/format";
import { ROLE_LABEL, type AdminUser } from "@/shared/types";

/** Readable random password: 3 groups of 4, no look-alike characters. */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map((b) => chars[b % chars.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export function AdminsPage({ me, onLogout }: { me: AdminUser; onLogout: () => void }) {
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState<{ name: string; username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setAdmins((await api<{ admins: AdminUser[] }>("/api/admin/admins")).admins);
    } catch (e) {
      if ((e as ApiError).status === 401) onLogout();
      else setError((e as ApiError).message);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const resetPassword = (a: AdminUser) => {
    if (!confirm(`${a.name} uchun yangi parol yaratilsinmi? Eski parol ishlamay qoladi.`)) return;
    const password = generatePassword();
    act(async () => {
      await api(`/api/admin/admins/${a.id}`, { method: "PATCH", body: { password } });
      setShown({ name: a.name, username: a.username, password });
    });
  };

  const toggleActive = (a: AdminUser) => {
    if (a.active && !confirm(`${a.name} bloklansinmi? U darhol tizimdan chiqariladi.`)) return;
    act(() => api(`/api/admin/admins/${a.id}`, { method: "PATCH", body: { active: !a.active } }));
  };

  const remove = (a: AdminUser) => {
    if (!confirm(`${a.name} butunlay o‘chirilsinmi? Uning qarorlari tarixda saqlanib qoladi.`)) return;
    act(() => api(`/api/admin/admins/${a.id}`, { method: "DELETE" }));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5">
      <h1 className="font-poster uppercase text-2xl font-bold">Adminlar</h1>
      <p className="text-sm text-bean/60">
        HR xodimlari arizalarni ko‘radi, qaror qabul qiladi va ish shartlarini tahrirlaydi. Adminlarni faqat siz boshqarasiz.
      </p>

      {shown && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950" role="status">
          <p className="font-semibold">{shown.name} uchun kirish ma’lumotlari</p>
          <p className="mt-1 text-sm">Hozir nusxa olib, xodimga yuboring — parol boshqa ko‘rsatilmaydi.</p>
          <div className="mt-3 rounded-xl bg-white p-3 font-mono text-sm leading-relaxed">
            Sayt: {location.origin}/admin
            <br />
            Login: {shown.username}
            <br />
            Parol: {shown.password}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                navigator.clipboard?.writeText(`Sayt: ${location.origin}/admin\nLogin: ${shown.username}\nParol: ${shown.password}`)
              }
              className="btn-primary h-10"
            >
              Nusxa olish
            </button>
            <button onClick={() => setShown(null)} className="btn-ghost h-10">
              Yopish
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

      <AddAdmin
        onCreated={(a, password) => {
          setShown({ name: a.name, username: a.username, password });
          load();
        }}
      />

      {!admins ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ember" />
        </div>
      ) : (
        <ul className="mt-5 card divide-y divide-line">
          {admins.map((a) => (
            <li key={a.id} className="px-4 py-3.5 flex flex-wrap items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${a.active ? "bg-foam text-ember" : "bg-stone-200 text-stone-500"}`}>
                {a.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold ${a.active ? "" : "text-bean/50 line-through"}`}>{a.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.role === "owner" ? "bg-ember text-foam" : "bg-sky-100 text-sky-900"}`}>
                    {ROLE_LABEL[a.role]}
                  </span>
                  {!a.active && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">Bloklangan</span>}
                  {a.id === me.id && <span className="text-xs text-bean/50">(siz)</span>}
                </span>
                <span className="block text-sm text-bean/60">
                  {a.username} · {a.lastLoginAt ? `oxirgi kirish ${formatStamp(a.lastLoginAt)}` : "hali kirmagan"}
                </span>
              </span>
              {a.role === "owner" ? (
                <span className="text-xs text-bean/50">Parol: Coolify → ADMIN_PASSWORD</span>
              ) : (
                <span className="flex gap-1">
                  <RowBtn label="Yangi parol" onClick={() => resetPassword(a)}>
                    <KeyRound className="w-4 h-4" />
                  </RowBtn>
                  <RowBtn label={a.active ? "Bloklash" : "Blokdan chiqarish"} onClick={() => toggleActive(a)}>
                    {a.active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </RowBtn>
                  <RowBtn label="O‘chirish" onClick={() => remove(a)} danger>
                    <Trash2 className="w-4 h-4" />
                  </RowBtn>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddAdmin({ onCreated }: { onCreated: (a: AdminUser, password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ admin: AdminUser }>("/api/admin/admins", { body: { name, username, password } });
      onCreated(r.admin, password);
      setOpen(false);
      setName("");
      setUsername("");
      setPassword(generatePassword());
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn-primary mt-5">
        <UserPlus className="w-4 h-4" aria-hidden /> HR qo‘shish
      </button>
    );

  return (
    <form onSubmit={submit} className="mt-5 card p-5 space-y-3">
      <h2 className="font-semibold">Yangi HR xodimi</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Ismi</span>
          <input required autoFocus className="field py-2.5" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Malika" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Login</span>
          <input
            required
            autoCapitalize="none"
            className="field py-2.5"
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
            placeholder="malika"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Parol</span>
          <span className="flex gap-1">
            <input required minLength={8} className="field py-2.5 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setPassword(generatePassword())} className="btn-ghost h-auto px-3 text-xs" title="Yangi parol yaratish">
              ↻
            </button>
          </span>
        </label>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10">
          Bekor qilish
        </button>
        <button disabled={busy} className="btn-primary h-10">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Qo‘shish
        </button>
      </div>
    </form>
  );
}

function RowBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-full p-2 transition-colors ${danger ? "text-red-600 hover:bg-red-50" : "text-bean/60 hover:bg-foam/60 hover:text-bean"}`}
    >
      {children}
    </button>
  );
}
