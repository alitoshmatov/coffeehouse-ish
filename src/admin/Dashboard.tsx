import { useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, Search } from "lucide-react";
import { formatStamp } from "@/shared/format";
import { branchLine } from "@/shared/hiring";
import type { Application, Round, Status } from "@/shared/types";
import { StatusBadge } from "@/ui/StatusBadge";
import { Detail } from "./Detail";

type Tab = Status | "all";
export type RoundData = {
  round: Round;
  applications: Application[];
  counts: Record<Status, number>;
  rescheduleRequests: number;
  storageWarning: string | null;
};
const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "Yangi" },
  { key: "interview", label: "Suhbat" },
  { key: "trial", label: "Sinov" },
  { key: "rejected", label: "Rad" },
  { key: "all", label: "Hammasi" },
];

/** Applications of one round: filter tabs, search, list and detail panel. */
export function Dashboard({
  data,
  refreshing,
  onRefresh,
  onChange,
}: {
  data: RoundData;
  refreshing: boolean;
  onRefresh: () => void;
  onChange: (a: Application) => void;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(location.hash.slice(1)) || null);
  const defaultPlace = branchLine(data.round.content);
  const error = "";

  useEffect(() => {
    history.replaceState(null, "", selectedId ? `#${selectedId}` : location.pathname);
  }, [selectedId]);

  // Opened from a link to a specific application → show its tab
  useEffect(() => {
    const a = data.applications.find((x) => x.id === selectedId);
    if (a && tab !== "all" && a.status !== tab) setTab(a.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.applications.filter(
      (a) =>
        (tab === "all" || a.status === tab) &&
        (!needle || a.fullName.toLowerCase().includes(needle) || a.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "\u0000")),
    );
  }, [data, tab, q]);

  const selected = data.applications.find((a) => a.id === selectedId) ?? null;
  const count = (t: Tab) => (t === "all" ? data.applications.length : data.counts[t]);
  const load = onRefresh;
  const replace = onChange;

  return (
    <div>
      <div className="py-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
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
                {t.key === "interview" && !!data.rescheduleRequests && (
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

          {visible.length === 0 ? (
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
