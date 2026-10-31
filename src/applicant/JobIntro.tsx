import { Check } from "lucide-react";
import { BRANCH_ADDRESS, EXPECT, FACTS, OFFER } from "@/shared/hiring";
import { BottomBar } from "./BottomBar";

export function JobIntro({ onApply }: { onApply: () => void }) {
  return (
    <main className="pb-28">
      <header className="bg-ember text-foam px-5 pt-8 pb-7">
        <p className="inline-flex items-center gap-2 rounded-full border border-foam/25 px-3 py-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Ishga qabul ochiq
        </p>
        <h1 className="mt-4 font-poster uppercase font-bold leading-[0.95] text-[2.6rem]">
          Barista bo‘lib jamoamizga qo‘shiling
        </h1>
        <p className="mt-3 text-foam/80 leading-relaxed">
          {BRANCH_ADDRESS}. Tajriba shart emas — o‘rgatamiz.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-foam/15 bg-foam/15">
          {FACTS.map((f) => (
            <div key={f.label} className="bg-ember px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wider text-rose">{f.label}</dt>
              <dd className="mt-0.5 font-poster text-xl font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="px-5 pt-7">
        <h2 className="font-poster uppercase text-2xl font-bold">Biz taklif qilamiz</h2>
        <ul className="mt-4 card divide-y divide-line">
          {OFFER.map((o) => (
            <li key={o.title} className="px-4 py-3.5">
              <p className="font-semibold">{o.title}</p>
              <p className="text-sm text-bean/70 leading-relaxed">{o.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-5 pt-7">
        <h2 className="font-poster uppercase text-2xl font-bold">Sizdan kutamiz</h2>
        <ul className="mt-4 space-y-3">
          {EXPECT.map((e) => (
            <li key={e} className="flex gap-3 text-bean/85 leading-relaxed">
              <Check className="w-5 h-5 mt-0.5 shrink-0 text-ember" aria-hidden />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </section>

      <BottomBar>
        <button onClick={onApply} className="btn-primary w-full">
          Ariza topshirish
        </button>
      </BottomBar>
    </main>
  );
}
