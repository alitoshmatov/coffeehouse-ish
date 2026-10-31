import { useEffect, useState } from "react";
import { Coffee, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Dashboard } from "./Dashboard";

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    document.title = "Arizalar — Coffee House";
    api<{ ok: boolean }>("/api/admin/session")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ember" />
      </div>
    );
  return authed ? <Dashboard onLogout={() => setAuthed(false)} /> : <Login onSuccess={() => setAuthed(true)} />;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { body: { password } });
      onSuccess();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-ember px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-cream p-7 shadow-xl">
        <span className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-ember text-foam">
          <Coffee className="w-6 h-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-poster uppercase text-3xl font-bold">Menejer paneli</h1>
        <p className="mt-1 text-bean/65">Barista arizalarini boshqarish</p>
        <label htmlFor="password" className="mt-6 mb-1.5 block text-sm font-medium">
          Parol
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          className={`field ${error ? "field-error" : ""}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !password} className="btn-primary mt-6 w-full">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Kirish
        </button>
      </form>
    </main>
  );
}
