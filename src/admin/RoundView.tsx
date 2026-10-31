import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Application, Round } from "@/shared/types";
import { Dashboard, type RoundData } from "./Dashboard";
import { ContentEditor } from "./ContentEditor";
import { OpenSwitch, StorageWarning } from "./StorageWarning";

export type RoundTab = "applications" | "content";

/** One hiring round: header (name, open switch) and its two tabs. */
export function RoundView({
  roundId,
  tab,
  onTab,
  onBack,
  onLogout,
}: {
  roundId: number;
  tab: RoundTab;
  onTab: (t: RoundTab) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [data, setData] = useState<RoundData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api<RoundData>(`/api/admin/rounds/${roundId}`));
      setError("");
    } catch (e) {
      const ae = e as ApiError;
      if (ae.status === 401) onLogout();
      else setError(ae.message);
    } finally {
      setRefreshing(false);
    }
  }, [roundId, onLogout]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data)
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        {error ? (
          <>
            <p className="text-red-600">{error}</p>
            <button onClick={onBack} className="btn-ghost h-10">
              Qabullarga qaytish
            </button>
          </>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-ember" />
        )}
      </div>
    );

  const { round } = data;
  const setRound = (r: Round) => setData((d) => d && { ...d, round: r });

  async function patch(body: { name?: string; open?: boolean }) {
    try {
      setRound((await api<{ round: Round }>(`/api/admin/rounds/${round.id}`, { method: "PATCH", body })).round);
    } catch (e) {
      alert((e as ApiError).message);
    }
  }

  const toggleOpen = () => {
    const msg = round.open
      ? `“${round.name}” yopilsinmi? Bu qabulga yangi arizalar qabul qilinmaydi.`
      : `“${round.name}” ochilsinmi? Nomzodlar shu qabulga ariza topshira oladi.`;
    if (confirm(msg)) patch({ open: !round.open });
  };

  const rename = () => {
    const name = prompt("Qabul nomi", round.name);
    if (name && name.trim() && name.trim() !== round.name) patch({ name: name.trim() });
  };

  async function remove() {
    if (!confirm(`“${round.name}” o‘chirilsinmi?`)) return;
    try {
      await api(`/api/admin/rounds/${round.id}`, { method: "DELETE" });
      onBack();
    } catch (e) {
      alert((e as ApiError).message);
    }
  }

  const empty = data.applications.length === 0;

  return (
    <>
      <StorageWarning path={data.storageWarning} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4">
        <a
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ember hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden /> Qabullar
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-poster uppercase text-2xl font-bold mr-auto flex items-center gap-2">
            {round.name}
            <button onClick={rename} className="rounded-full p-1.5 text-bean/40 hover:bg-foam/60 hover:text-bean" aria-label="Nomini o‘zgartirish" title="Nomini o‘zgartirish">
              <Pencil className="w-4 h-4" />
            </button>
          </h1>
          <OpenSwitch open={round.open} onToggle={toggleOpen} />
          {empty && (
            <button onClick={remove} className="rounded-full p-2 text-red-600 hover:bg-red-50" aria-label="Qabulni o‘chirish" title="Qabulni o‘chirish (arizasi yo‘q)">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-1 border-b border-line" role="tablist">
          {(
            [
              ["applications", `Arizalar (${data.applications.length})`],
              ["content", "Ish shartlari"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === key ? "border-ember text-bean" : "border-transparent text-bean/55 hover:text-bean"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {tab === "applications" ? (
          <Dashboard
            data={data}
            refreshing={refreshing}
            onRefresh={load}
            onChange={(a: Application) => {
              setData((d) => d && { ...d, applications: d.applications.map((x) => (x.id === a.id ? a : x)) });
              load();
            }}
          />
        ) : (
          <div className="pt-5">
            <ContentEditor key={round.id} round={round} onSaved={setRound} onLogout={onLogout} />
          </div>
        )}
      </div>
    </>
  );
}
