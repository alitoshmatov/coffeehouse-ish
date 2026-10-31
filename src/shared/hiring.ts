/**
 * Job post content. Shared by the mini app (shown to applicants) and the
 * server (used in bot messages). Keep in sync with
 * ch-landing/src/pages/barista-hiring/data.ts.
 */
export const BRANCH_NAME = "Coffee House Qorabog‘";
export const BRANCH_ADDRESS = "Qorabog‘ Jome masjidi ro‘parasi (yangi filial)";
export const SALARY = "2 500 000 so‘m";

export const FACTS = [
  { label: "Oylik", value: SALARY },
  { label: "Ish vaqti", value: "05:00–15:00" },
  { label: "Filial", value: "Qorabog‘" },
  { label: "Sinov muddati", value: "30 kun" },
];

export const OFFER: { title: string; text: string }[] = [
  { title: `Oylik ${SALARY}`, text: "Har oyning 1-sanasida beriladi. Sinov muddatida ham to‘lanadi." },
  { title: "Oylik oshib boradi", text: "Har 6 oyda ish natijangizga qarab oylikni qayta ko‘rib chiqamiz." },
  { title: "Bepul ichimlik", text: "Menyudagi ichimliklardan kuniga 30 000 so‘mgacha — oylikdan ushlanmaydi." },
  { title: "Noldan o‘rgatamiz", text: "Tajribangiz bo‘lmasa ham qahva tayyorlashni o‘rgatamiz." },
  { title: "Ish vaqti", text: "Har kuni 05:00–15:00. Ba’zida 2-smena: 14:00–23:00. Dam olish kuni yo‘q." },
];

export const EXPECT: string[] = [
  "Dastlabki 30 kun — sinov muddati. Bu davrda ham oylik to‘lanadi, lekin ishni yaxshi o‘rganmasangiz, ishdan bo‘shatilasiz.",
  "Ishga vaqtida kelish va ketish. Muhim ish chiqsa — oldindan ogohlantirib, o‘rningizga smenadoshni kelishib qo‘yish.",
  "Halol ishlash: kassa va mahsulotlarga mas’uliyat bilan qarash.",
  "Har bir buyurtma, xarajat va kirimni planshetdagi MizanPOS dasturiga kiritish.",
  "Tozalik va ichki tartib-qoidalarga rioya qilish.",
  "Yangi narsalarni o‘rganish va yangiliklar kiritishga yordam berish.",
  "Ba’zida boshqa filiallarimizda ham ishlab berish.",
  "Ishdan ketmoqchi bo‘lsangiz, 15 kun oldin ogohlantirish.",
];
