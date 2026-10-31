import { Check } from "lucide-react";
import type { JobContent } from "@/shared/hiring";
import { BottomBar } from "./BottomBar";

/**
 * Job post shown to applicants. Also rendered as a live preview in the admin
 * content editor (`preview`), where the action bar is not fixed to the screen.
 */
export function JobIntro({ content: c, onApply, preview }: { content: JobContent; onApply?: () => void; preview?: boolean }) {
  const action = (
    <button onClick={onApply} className="btn-primary w-full" tabIndex={preview ? -1 : undefined}>
      Ariza topshirish
    </button>
  );

  return (
    <main className={preview ? "" : "pb-28"}>
      <header className="bg-ember text-foam px-5 pt-8 pb-7">
        <p className="inline-flex items-center gap-2 rounded-full border border-foam/25 px-3 py-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Ishga qabul ochiq
        </p>
        <h1 className="mt-4 font-poster uppercase font-bold leading-[0.95] text-[2.6rem] break-words">{c.title}</h1>
        {c.intro && <p className="mt-3 text-foam/80 leading-relaxed whitespace-pre-line">{c.intro}</p>}
        {c.facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-foam/15 bg-foam/15">
            {c.facts.map((f, i) => (
              <div key={i} className={`bg-ember px-4 py-3 ${c.facts.length % 2 && i === c.facts.length - 1 ? "col-span-2" : ""}`}>
                <dt className="text-[11px] uppercase tracking-wider text-rose">{f.label}</dt>
                <dd className="mt-0.5 font-poster text-xl font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {c.offer.length > 0 && (
        <section className="px-5 pt-7">
          <h2 className="font-poster uppercase text-2xl font-bold">Biz taklif qilamiz</h2>
          <ul className="mt-4 card divide-y divide-line">
            {c.offer.map((o, i) => (
              <li key={i} className="px-4 py-3.5">
                <p className="font-semibold">{o.title}</p>
                {o.text && <p className="text-sm text-bean/70 leading-relaxed">{o.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.expect.length > 0 && (
        <section className="px-5 pt-7">
          <h2 className="font-poster uppercase text-2xl font-bold">Sizdan kutamiz</h2>
          <ul className="mt-4 space-y-3">
            {c.expect.map((e, i) => (
              <li key={i} className="flex gap-3 text-bean/85 leading-relaxed">
                <Check className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview ? <div className="px-5 py-5">{action}</div> : <BottomBar>{action}</BottomBar>}
    </main>
  );
}
