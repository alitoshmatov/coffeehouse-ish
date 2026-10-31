import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, RefreshCw, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatStamp } from "@/shared/format";
import type { Application, Status } from "@/shared/types";
import { StatusBadge } from "@/ui/StatusBadge";
import { Detail } from "./Detail";
import { branchLine, type JobContent } from "@/shared/hiring";

type Tab = Status | "all";
type ListRes = { applications: Application[]; counts: Record<Status, number>; rescheduleRequests: number; hiringOpen: boolean };
const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "Yangi" },
  { key: "interview", label: "Suhbat" },
  { key: "trial", label: "Sinov" },
  { key: "rejected", label: "Rad" },
  { key: "all", label: "Hammasi" },
];

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<ListRes | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("new");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(location.hash.slice(1)) || null);
  const [refreshing, setRefreshing] = useState(false);
  const [defaultPlace, setDefaultPlace] = useState("");

  useEffect(() => {
    api<{ content: JobContent }>("/api/admin/content")
      .then((r) => setDefaultPlace(branchLine(r.content)))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api<ListRes>("/api/admin/applications"));
      setError("");
    } catch (e) {
      if ((e as ApiError).status === 401) onLogout();
      else setError((e as ApiError).message);
    } finally {
      setRefreshing(false);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    history.replaceState(null, "", selectedId ? `#${selectedId}` : location.pathname);
  }, [selectedId]);

  const visible = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.applications.filter(
      (a) =>
        (tab === "all" || a.status === tab) &&
        (!needle || a.fullName.toLowerCase().includes(needle) || a.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "\u0000")),
    );
  }, [data, tab, q]);

  const selected = data?.applications.find((a) => a.id === selectedId) ?? null;

  function replace(updated: Application) {
    setData((d) => d && { ...d, applications: d.applications.map((a) => (a.id === updated.id ? updated : a)) });
    load();
  }

  async function toggleHiring() {
    if (!data) return;
    const next = !data.hiringOpen;
    if (!confirm(next ? "Ariza qabulini ochasizmi?" : "Ariza qabulini yopasizmi? Yangi arizalar qabul qilinmaydi.")) return;
    const r = await api<{ hiringOpen: boolean }>("/api/admin/settings", { body: { hiringOpen: next } });
    setData({ ...data, hiringOpen: r.hiringOpen });
  }

  const count = (t: Tab) => (!data ? 0 : t === "all" ? data.applications.length : data.counts[t]);

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-poster uppercase text-2xl font-bold">Barista arizalari</h1>
        {data && (
          <button
            onClick={toggleHiring}
            role="switch"
            aria-checked={data.hiringOpen}
            className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm hover:bg-foam/50"
          >
            <span className={`relative h-5 w-9 rounded-full transition-colors ${data.hiringOpen ? "bg-emerald-500" : "bg-stone-300"}`} aria-hidden>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${data.hiringOpen ? "left-[18px]" : "left-0.5"}`} />
            </span>
            {data.hiringOpen ? "Ariza qabuli ochiq" : "Ariza qabuli yopiq"}
          </button>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
        <section className={selected ? "hidden lg:block" : ""}>
          <div className="flex gap-1 overflow-x-auto rounded-full bg-white border border-line p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-ember text-foam" : "text-bean/70 hover:bg-foam/60"
                }`}
              >
                {t.label} <span className="tabular-nums opacity-70">{count(t.key)}</span>
                {t.key === "interview" && !!data?.rescheduleRequests && (
                  <span
                    className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
                    title={`${data.rescheduleRequests} ta nomzod boshqa vaqt so‘radi`}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Qidirish</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-bean/40" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki telefon" className="field pl-10 py-2.5" />
            </label>
            <button onClick={load} className="btn-ghost h-auto px-3.5" aria-label="Yangilash">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {!data ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-ember" />
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-3 card py-14 text-center text-bean/60">
              <Inbox className="mx-auto w-8 h-8 text-bean/30" aria-hidden />
              <p className="mt-2">{q ? "Hech narsa topilmadi" : "Bu bo‘limda ariza yo‘q"}</p>
            </div>
          ) : (
            <ul className="mt-3 card divide-y divide-line overflow-hidden">
              {visible.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors ${
                      a.id === selectedId ? "bg-foam/70" : "hover:bg-foam/40"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foam font-semibold text-ember">
                      {a.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{a.fullName}</span>
                        {tab === "all" && <StatusBadge status={a.status} />}
                      </span>
                      <span className="block truncate text-sm text-bean/60">
                        {a.age} yosh · {a.phone}
                      </span>
                      {a.status === "interview" && <ReplyTag app={a} />}
                    </span>
                    <span className="shrink-0 text-xs text-bean/50">{formatStamp(a.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={selected ? "" : "hidden lg:block"}>
          {selected ? (
            <Detail key={selected.id} application={selected} defaultPlace={defaultPlace} onBack={() => setSelectedId(null)} onChange={replace} />
          ) : (
            <div className="card h-full min-h-[320px] flex items-center justify-center text-bean/50">Arizani tanlang</div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Candidate's answer to the invitation, shown in the list. */
function ReplyTag({ app }: { app: Application }) {
  if (app.interviewResponse === "confirmed")
    return <span className="mt-1 inline-block text-xs font-medium text-emerald-700">✓ Keladi</span>;
  if (app.interviewResponse === "reschedule")
    return <span className="mt-1 inline-block text-xs font-semibold text-amber-700">🕒 Boshqa vaqt so‘radi</span>;
  return <span className="mt-1 inline-block text-xs text-bean/45">Javob kutilmoqda</span>;
}
