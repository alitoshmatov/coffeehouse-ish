/**
 * Job post content ("Ish shartlari"). Admins edit it in the panel; it is stored in the
 * database and used by the mini app and the bot. DEFAULT_CONTENT is used until the first save.
 */
export interface JobContent {
  title: string;
  intro: string;
  branchName: string;
  branchAddress: string;
  facts: { label: string; value: string }[];
  offer: { title: string; text: string }[];
  expect: string[];
}

export const DEFAULT_CONTENT: JobContent = {
  title: "Barista bo‘lib jamoamizga qo‘shiling",
  intro: "Qorabog‘ Jome masjidi ro‘parasidagi yangi filial. Tajriba shart emas — o‘rgatamiz.",
  branchName: "Coffee House Qorabog‘",
  branchAddress: "Qorabog‘ Jome masjidi ro‘parasi (yangi filial)",
  facts: [
    { label: "Oylik", value: "2 500 000 so‘m" },
    { label: "Ish vaqti", value: "05:00–15:00" },
    { label: "Filial", value: "Qorabog‘" },
    { label: "Sinov muddati", value: "30 kun" },
  ],
  offer: [
    { title: "Oylik 2 500 000 so‘m", text: "Har oyning 1-sanasida beriladi. Sinov muddatida ham to‘lanadi." },
    { title: "Oylik oshib boradi", text: "Har 6 oyda ish natijangizga qarab oylikni qayta ko‘rib chiqamiz." },
    { title: "Bepul ichimlik", text: "Menyudagi ichimliklardan kuniga 30 000 so‘mgacha — oylikdan ushlanmaydi." },
    { title: "Noldan o‘rgatamiz", text: "Tajribangiz bo‘lmasa ham qahva tayyorlashni o‘rgatamiz." },
    { title: "Ish vaqti", text: "Har kuni 05:00–15:00. Ba’zida 2-smena: 14:00–23:00. Dam olish kuni yo‘q." },
  ],
  expect: [
    "Dastlabki 30 kun — sinov muddati. Bu davrda ham oylik to‘lanadi, lekin ishni yaxshi o‘rganmasangiz, ishdan bo‘shatilasiz.",
    "Ishga vaqtida kelish va ketish. Muhim ish chiqsa — oldindan ogohlantirib, o‘rningizga smenadoshni kelishib qo‘yish.",
    "Halol ishlash: kassa va mahsulotlarga mas’uliyat bilan qarash.",
    "Har bir buyurtma, xarajat va kirimni planshetdagi MizanPOS dasturiga kiritish.",
    "Tozalik va ichki tartib-qoidalarga rioya qilish.",
    "Yangi narsalarni o‘rganish va yangiliklar kiritishga yordam berish.",
    "Ba’zida boshqa filiallarimizda ham ishlab berish.",
    "Ishdan ketmoqchi bo‘lsangiz, 15 kun oldin ogohlantirish.",
  ],
};

export const CONTENT_LIMITS = { short: 60, title: 80, text: 300, items: 12, facts: 6 };

export const branchLine = (c: Pick<JobContent, "branchName" | "branchAddress">) =>
  [c.branchName, c.branchAddress].filter(Boolean).join(", ");

/** Clean up and check content coming from the editor. */
export function validateContent(input: unknown): { ok: true; value: JobContent } | { ok: false; error: string } {
  const d = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
  const L = CONTENT_LIMITS;

  const value: JobContent = {
    title: str(d.title, L.title),
    intro: str(d.intro, L.text),
    branchName: str(d.branchName, L.title),
    branchAddress: str(d.branchAddress, L.text),
    facts: arr(d.facts, L.facts)
      .map((f) => ({ label: str((f as any)?.label, L.short), value: str((f as any)?.value, L.short) }))
      .filter((f) => f.label || f.value),
    offer: arr(d.offer, L.items)
      .map((o) => ({ title: str((o as any)?.title, L.title), text: str((o as any)?.text, L.text) }))
      .filter((o) => o.title || o.text),
    expect: arr(d.expect, L.items).map((e) => str(e, L.text)).filter(Boolean),
  };

  if (!value.title) return { ok: false, error: "Sarlavha bo‘sh bo‘lmasin." };
  if (!value.branchName) return { ok: false, error: "Filial nomini yozing." };
  if (value.facts.some((f) => !f.label || !f.value)) return { ok: false, error: "Har bir qisqa ma’lumotda nom va qiymat bo‘lsin." };
  if (value.offer.some((o) => !o.title)) return { ok: false, error: "Har bir “Biz taklif qilamiz” bandida sarlavha bo‘lsin." };
  return { ok: true, value };
}
