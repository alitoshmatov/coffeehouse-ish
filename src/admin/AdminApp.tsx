import { useCallback, useEffect, useState } from "react";
import { Coffee, Loader2, LogOut } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ROLE_LABEL, type AdminUser } from "@/shared/types";
import { AdminsPage } from "./AdminsPage";
import { RoundsPage } from "./RoundsPage";
import { RoundView, type RoundTab } from "./RoundView";

/*
 * Routes:  /admin                 → Qabullar (rounds list)
 *          /admin/q/:id           → round → Arizalar   (#<applicationId> opens one)
 *          /admin/q/:id/shartlar  → round → Ish shartlari
 *          /admin/adminlar        → Adminlar (main admin)
 */
type Route = { page: "rounds" } | { page: "admins" } | { page: "round"; id: number; tab: RoundTab };

function parse(path: string): Route {
  if (path.startsWith("/admin/adminlar")) return { page: "admins" };
  const m = /^\/admin\/q\/(\d+)(\/shartlar)?/.exec(path);
  if (m) return { page: "round", id: Number(m[1]), tab: m[2] ? "content" : "applications" };
  return { page: "rounds" };
}
const toPath = (r: Route) =>
  r.page === "admins" ? "/admin/adminlar" : r.page === "round" ? `/admin/q/${r.id}${r.tab === "content" ? "/shartlar" : ""}` : "/admin";

export default function AdminApp() {
  const [me, setMe] = useState<AdminUser | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));

  useEffect(() => {
    api<{ admin: AdminUser | null }>("/api/admin/session")
      .then((r) => setMe(r.admin))
      .catch(() => setMe(null));
    const onPop = () => setRoute(parse(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = { rounds: "Qabullar", round: "Qabul", admins: "Adminlar" }[route.page] + " — Coffee House";
  }, [route]);

  const go = (r: Route) => {
    const path = toPath(r);
    if (path === location.pathname && !location.hash) return;
    history.pushState(null, "", path);
    setRoute(r);
    window.scrollTo(0, 0);
  };

  const onLoggedOut = useCallback(() => setMe(null), []);

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setMe(null);
  }

  if (me === undefined)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ember" />
      </div>
    );
  if (!me) return <Login onSuccess={setMe} />;

  const current: Route = route.page === "admins" && me.role !== "owner" ? { page: "rounds" } : route;
  const nav: { route: Route; label: string; active: boolean }[] = [
    { route: { page: "rounds" }, label: "Qabullar", active: current.page !== "admins" },
    ...(me.role === "owner" ? [{ route: { page: "admins" } as Route, label: "Adminlar", active: current.page === "admins" }] : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="bg-ember text-foam">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <p className="font-poster uppercase text-2xl font-bold leading-none">Coffee House</p>
            <p className="text-sm text-foam/70">Barista ishga qabul · menejer paneli</p>
          </div>
          <p className="text-sm text-right leading-tight">
            <span className="block font-medium">{me.name}</span>
            {ROLE_LABEL[me.role] !== me.name && <span className="text-foam/60">{ROLE_LABEL[me.role]}</span>}
          </p>
          <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:bg-foam/10" aria-label="Chiqish">
            <LogOut className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Chiqish</span>
          </button>
        </div>
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 mt-3 flex gap-1 overflow-x-auto" aria-label="Bo‘limlar">
          {nav.map((n) => (
            <a
              key={n.label}
              href={toPath(n.route)}
              onClick={(e) => {
                e.preventDefault();
                go(n.route);
              }}
              aria-current={n.active ? "page" : undefined}
              className={`whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                n.active ? "bg-cream text-bean" : "text-foam/80 hover:bg-foam/10"
              }`}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      {current.page === "rounds" && <RoundsPage onOpen={(id) => go({ page: "round", id, tab: "applications" })} onLogout={onLoggedOut} />}
      {current.page === "round" && (
        <RoundView
          key={current.id}
          roundId={current.id}
          tab={current.tab}
          onTab={(tab) => go({ ...current, tab })}
          onBack={() => go({ page: "rounds" })}
          onLogout={onLoggedOut}
        />
      )}
      {current.page === "admins" && <AdminsPage me={me} onLogout={onLoggedOut} />}
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: (a: AdminUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ admin: AdminUser }>("/api/admin/login", { body: { username, password } });
      onSuccess(r.admin);
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
        <label htmlFor="username" className="mt-6 mb-1.5 block text-sm font-medium">
          Login
        </label>
        <input id="username" autoComplete="username" autoCapitalize="none" autoFocus className="field" value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="password" className="mt-4 mb-1.5 block text-sm font-medium">
          Parol
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={`field ${error ? "field-error" : ""}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !username || !password} className="btn-primary mt-6 w-full">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Kirish
        </button>
      </form>
    </main>
  );
}
