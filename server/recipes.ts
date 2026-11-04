import type { RecipeBook, RecipeCategory, RecipeItem, RecipeLine, RecipeSize } from "../src/shared/types";

/**
 * House recipes from the cost sheet ("Coffee House tan narx"), without prices.
 * Amounts per drink. Method steps follow the Barista school course.
 * Kept on the server so only trial baristas receive them (GET /api/recipes).
 */

type Cup = "s" | "m" | "l" | "c5" | "c7" | "cone" | "icup";
const CUP: Record<Cup, string> = {
  s: "S · 0,25 l kraft stakan",
  m: "M · 0,35 l kraft stakan",
  l: "L · 0,45 l kraft stakan",
  c5: "0,5 l shaffof sovuq stakan",
  c7: "0,7 l shaffof sovuq stakan",
  cone: "Vafli konus",
  icup: "Muzqaymoq stakanchasi",
};

const ING = {
  kofe: ["Kofe", "g"],
  sut: ["Sut", "ml"],
  slivki: ["Slivki 12%", "ml"],
  sirop: ["Sirop", "g"],
  kakao: ["Kakao", "g"],
  limon: ["Limon", "g"],
  laimon: ["Laimon Fresh", "ml"],
  banan: ["Banan", "g"],
  konst: ["Choy konsentrat", "g"],
  asal: ["Asal", "g"],
  choy: ["Choy paketchasi", "dona"],
  smes: ["Smes (muzqaymoq)", "g"],
  qul: ["Qulupnay", "g"],
  shakar: ["Shakar (alohida)", "g"],
} as const;
type Key = keyof typeof ING;
type Ing = Partial<Record<Key, number | null>>;
type Z = Record<Key, number>;

const n = (v: number) => String(v).replace(".", ",");

/* ── step texts ── */
const take = (c: Cup) => `${CUP[c]} oling.`;
const grind = (g: number) => `Portafiltrga ${g} g kofe torting, tekislang va bir tekis bosing.`;
const shotCup = (g: number) => `Espresso tayyorlang (${g} g kofe → taxminan ${g * 2} g espresso, 25–30 s) va stakanga quying.`;
const shotOver = (g: number) => `Espresso tayyorlang (${g} g → taxminan ${g * 2} g) va ustidan sekin quying.`;
const sugar = (z: Z) => (z.shakar ? ` Shakarni (${n(z.shakar)} g) alohida taklif qiling.` : "");
const lidHot = (z: Z) => `Qopqoqni yoping.${sugar(z)}`;
const lidCold = (z: Z) => `Gumbaz qopqoqni yoping va trubochka qo‘ying.${sugar(z)}`;
const ice = "Stakanni taxminan uchdan ikki qismigacha muz bilan to‘ldiring.";

function size(label: string, cup: Cup, ing: Ing, steps: (z: Z) => string[], lid = true): RecipeSize {
  const lines: RecipeLine[] = [{ name: "Stakan", amount: CUP[cup], base: true }];
  if (lid) lines.push({ name: "Qopqoq va h.k.", amount: "1 dona", base: true });
  const keys = (Object.keys(ing) as Key[]).sort((a, b) => Number(a === "shakar") - Number(b === "shakar"));
  for (const k of keys) {
    const [name, unit] = ING[k];
    const q = ing[k];
    lines.push(
      q == null
        ? { name, amount: "miqdori hali belgilanmagan" }
        : { name, amount: `${n(q)} ${unit}`, qty: q, unit, base: k === "shakar" || undefined },
    );
  }
  return { size: label, cup: CUP[cup], lines, steps: steps(ing as Z) };
}

const item = (id: string, name: string, sizes: RecipeSize[], extra: { tip?: string; note?: string } = {}): RecipeItem => ({
  id,
  name,
  sizes,
  ...extra,
});

/* ── coffee ── */
const espresso = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  `Qo‘sh espresso tayyorlang: 25–30 s da taxminan ${z.kofe * 2} g, to‘g‘ridan-to‘g‘ri stakanga.`,
  lidHot(z),
];

const cappuccino = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  shotCup(z.kofe),
  `${z.sut} ml sovuq sutni qalin ko‘pik bilan (taxminan 1,5 sm) 60–65 °C gacha bug‘lang.`,
  "Sutni espressoga quying: avval aralashishi uchun balanddan, so‘ng ko‘pik ustida qolishi uchun pastdan.",
  lidHot(z),
];
const americano = (c: Cup) => (z: Z) => [
  take(c),
  "Stakanga dispenserdan issiq suv (92–96 °C) quying, tepada espresso uchun joy qoldiring.",
  grind(z.kofe),
  `Espresso tayyorlang (${z.kofe} g → taxminan ${z.kofe * 2} g) va krema ustida qolishi uchun suv ustidan quying.`,
  lidHot(z),
];
const latte = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  shotCup(z.kofe),
  `${z.sut} ml sovuq sutni yupqa, yaltiroq ko‘pik bilan (taxminan 0,5–1 sm) 60–65 °C gacha bug‘lang.`,
  "Sutni espressoga bir tekis oqim bilan quying va ustida yurak bilan tugating.",
  lidHot(z),
];
const raf = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  `Espressoni (${z.kofe} g → taxminan ${z.kofe * 2} g) sut pitcheriga tayyorlang.`,
  `Pitcherga ${z.sut} ml sut, ${z.slivki} ml slivki va ${z.sirop} g sirop qo‘shing.`,
  "Hammasini birga kremsimon bo‘lguncha, yengil ko‘pik bilan 60–65 °C gacha bug‘lang. Slivkini qaynatmang.",
  "Stakanga quying.",
  lidHot(z),
];
const flatWhite = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  shotCup(z.kofe),
  `${z.sut} ml sovuq sutni juda yupqa, ipakdek mikroko‘pik bilan (taxminan 0,5 sm) 60–65 °C gacha bug‘lang.`,
  "Sirtga yaqin, sekin quying va kichik yurak bilan tugating.",
  lidHot(z),
];
const cocoa = (c: Cup) => (z: Z) => [
  take(c),
  `Stakanga ${z.kakao} g kakao kukuni soling.`,
  "Ozgina issiq sut qo‘shing va bo‘laksiz silliq pasta bo‘lguncha aralashtiring.",
  `Qolgan sutni (jami ≈ ${z.sut} ml) ozgina ko‘pik bilan 60–65 °C gacha bug‘lang.`,
  "Aralashtirib turib quying va ustida ko‘pik bilan tugating.",
  lidHot(z),
];

/* ── ice coffee ── */
const iceAmericano = (c: Cup) => (z: Z) => [take(c), ice, "Sovuq suv qo‘shing, tepada espresso uchun joy qoldiring.", grind(z.kofe), shotOver(z.kofe), lidCold(z)];
const iceCappuccino = (c: Cup) => (z: Z) => {
  const first = Math.round((z.sut * 0.65) / 5) * 5;
  return [
    take(c),
    ice,
    `Muz ustiga ${first} ml sovuq sut quying. Qolgan ${z.sut - first} ml sutni alohida qoldiring.`,
    grind(z.kofe),
    shotOver(z.kofe),
    `Qolgan ${z.sut - first} ml sovuq sutni bug‘siz, frother yoki sheyker bilan qalin sovuq ko‘pikka aylantiring.`,
    "Sovuq ko‘pikni qoshiq bilan ustiga qo‘ying.",
    lidCold(z),
  ];
};
const iceLatte = (c: Cup) => (z: Z) => [
  take(c),
  ice,
  `Muz ustiga ${z.sut} ml sovuq sut quying.`,
  grind(z.kofe),
  `Espresso tayyorlang (${z.kofe} g → taxminan ${z.kofe * 2} g) va qatlamli ko‘rinish uchun qoshiq orqasidan sekin quying.`,
  lidCold(z),
];
const iceRaf = (c: Cup) => (z: Z) => [
  take(c),
  ice,
  grind(z.kofe),
  `Sheyker yoki blender idishiga ${z.sut} ml sovuq sut, ${z.slivki} ml slivki va espresso (${z.kofe} g → taxminan ${z.kofe * 2} g) soling.`,
  "Ko‘piklanguncha 10–15 s chayqating yoki aralashtiring.",
  "Muz ustiga quying.",
  lidCold(z),
];

/* ── mohito, cocktails, tea, milkshake, ice cream ── */
const mohito = (c: Cup) => (z: Z) => [
  take(c),
  `${z.limon} g limonni bo‘laklarga kesib, stakanga soling.`,
  "Sharbat chiqishi uchun limonni madler bilan ezing.",
  ...(z.sirop ? [`${z.sirop} g sirop qo‘shing.`] : []),
  ice,
  `${z.laimon} ml sovuq Laimon Fresh quying va tubidan sekin aralashtiring.`,
  lidCold(z),
];
const shake = (c: Cup, kind: "banan" | "qul" | "choco") => (z: Z) => [
  take(c),
  `Blender idishiga ${z.sut} ml sovuq sut quying.`,
  ...(kind === "banan" ? [`${z.banan} g bananni tozalab, bo‘laklarga bo‘ling va qo‘shing.`] : []),
  ...(kind === "qul" ? ["Yuvilgan qulupnayni qo‘shing."] : []),
  kind === "choco" ? `${z.sirop} g shokolad siropi qo‘shing.` : `${z.sirop} g sirop qo‘shing.`,
  "Silliq bo‘lguncha 30–40 s aralashtiring.",
  "Stakanga quying.",
  lidCold(z),
];
const tea = (c: Cup) => (z: Z) => [
  take(c),
  "Qaysi ta’mni so‘rang: oblepixa, imbirniy yoki yagodniy.",
  `Stakanga ${z.konst} g choy konsentrati va ${z.asal} g asal soling.`,
  "Choy paketchasini qo‘shing.",
  "Chetidan 1 sm pastgacha issiq suv (taxminan 95 °C) quying.",
  "Asal eriguncha aralashtiring, so‘ng qopqoqni yoping.",
];
const milkshake = (c: Cup) => (z: Z) => [
  take(c),
  `Blender idishini muzqaymoq mashinasidan ${z.smes} g muzqaymoq bilan to‘ldiring.`,
  `${z.sut} ml sovuq sut va ${z.sirop} g sirop qo‘shing.`,
  "Quyuq va silliq bo‘lguncha 20–30 s aralashtiring.",
  "Stakanga quying.",
  lidCold(z),
];
const cone = (z: Z) => [take("cone"), `Richagni torting va konusni ${z.smes} g muzqaymoq bilan zich spiral qilib aylantirib to‘ldiring.`, "Darhol salfetka bilan bering."];
const icup = (z: Z) => [take("icup"), `Richagni torting va stakanchani ${z.smes} g muzqaymoq bilan to‘ldiring, so‘ng ustida spiral bilan tugating.`, "Qoshiq qo‘ying va bering."];

const HOT = 29;
const CATEGORIES: RecipeCategory[] = [
  {
    id: "kofe",
    title: "Kofe",
    items: [
      item("espresso", "Espresso", [size("S", "s", { kofe: 18, shakar: HOT }, espresso("s"))], {
        tip: "Bir daqiqa ichida bering: krema tez yo‘qoladi.",
      }),
      item(
        "cappuccino",
        "Cappuccino",
        [
          size("S", "s", { kofe: 9, sut: 200, shakar: HOT }, cappuccino("s")),
          size("M", "m", { kofe: 18, sut: 280, shakar: HOT }, cappuccino("m")),
          size("L", "l", { kofe: 18, sut: 380, shakar: HOT }, cappuccino("l")),
        ],
        { tip: "Cappuccino menyudagi eng qalin ko‘pikka ega, taxminan 1,5 sm. To‘la stakan hajmiga nisbatan yengil bo‘lishi kerak." },
      ),
      item(
        "americano",
        "Americano",
        [
          size("S", "s", { kofe: 9, shakar: HOT }, americano("s")),
          size("M", "m", { kofe: 18, shakar: HOT }, americano("m")),
          size("L", "l", { kofe: 18, shakar: HOT }, americano("l")),
        ],
        { tip: "Avval suv, keyin espresso: krema saqlanadi va ichimlik kamroq achchiq bo‘ladi." },
      ),
      item(
        "latte",
        "Latte",
        [size("M", "m", { kofe: 9, sut: 260, shakar: HOT }, latte("m")), size("L", "l", { kofe: 18, sut: 380, shakar: HOT }, latte("l"))],
        { tip: "Latteda ko‘pik cappuccinodan kam: bug‘langan sut ho‘l bo‘yoqdek quyilishi kerak." },
      ),
      item(
        "raf",
        "Raf",
        [
          size("S", "s", { kofe: 9, sut: 100, sirop: 25, slivki: 50 }, raf("s")),
          size("M", "m", { kofe: 18, sut: 130, sirop: 30, slivki: 100 }, raf("m")),
          size("L", "l", { kofe: 18, sut: 200, sirop: 60, slivki: 100 }, raf("l")),
        ],
        { tip: "Raf espresso bilan birga pitcherda bug‘lanadi, shuning uchun u silliq va shirin. Shakar alohida berilmaydi." },
      ),
      item("flat-white", "Flat White", [size("S", "s", { kofe: 18, sut: 190, shakar: HOT }, flatWhite("s"))], {
        tip: "Flat White menyudagi eng kuchli sutli kofe: kichik stakanda qo‘sh shot va deyarli ko‘piksiz.",
      }),
    ],
  },
  {
    id: "kakao",
    title: "Kakao",
    items: [
      item("goryachiy-shokolad", "Goryachiy shokolad", [size("S", "s", { kakao: 20, sut: 120, shakar: 17.5 }, cocoa("s"))], {
        tip: "Issiq shokoladda kakaodan kamroq sut bor, shuning uchun u quyuqroq.",
      }),
      item("kakao", "Kakao", [size("M", "m", { kakao: 20, sut: 150, shakar: 17.5 }, cocoa("m"))], {
        tip: "Avval pasta tayyorlang: to‘g‘ridan-to‘g‘ri issiq sutga solingan kakao quruq bo‘lak bo‘lib suzib yuradi.",
      }),
    ],
  },
  {
    id: "ice",
    title: "Ice Coffee",
    items: [
      item("ice-americano", "Ice Americano", [size("M", "c5", { kofe: 18, shakar: HOT }, iceAmericano("c5")), size("L", "c7", { kofe: 18, shakar: HOT }, iceAmericano("c7"))], {
        tip: "Espressoni oxirida va sekin muz ustiga quying: u darhol soviydi va hidini saqlaydi.",
      }),
      item(
        "ice-cappuccino",
        "Ice Cappuccino",
        [size("M", "c5", { kofe: 18, sut: 200, shakar: HOT }, iceCappuccino("c5")), size("L", "c7", { kofe: 18, sut: 300, shakar: HOT }, iceCappuccino("c7"))],
        { tip: "Sovuq ko‘pik bug‘siz tayyorlanadi: issiq ko‘pik muzni eritib, ichimlikni suyultiradi." },
      ),
      item("ice-latte", "Ice Latte", [size("M", "c5", { kofe: 18, sut: 290, shakar: HOT }, iceLatte("c5")), size("L", "c7", { kofe: 18, sut: 340, shakar: HOT }, iceLatte("c7"))], {
        tip: "Espressoni sekin quying: u sovuq sut ustida suzib, mehmonlar yoqtiradigan qatlamlarni hosil qiladi.",
      }),
      item("ice-raf", "Ice Raf", [size("M", "c5", { kofe: 18, sut: 150, slivki: 100 }, iceRaf("c5")), size("L", "c7", { kofe: 18, sut: 250, slivki: 100 }, iceRaf("c7"))], {
        tip: "Slivkini muzga tushishidan oldin espresso bilan chayqating, shunda ichimlik suyuq emas, ipakdek bo‘ladi.",
      }),
    ],
  },
  {
    id: "mohito",
    title: "Mohito",
    items: [
      item("mohito", "Mohito", [size("0,5 l", "c5", { limon: 30, laimon: 290 }, mohito("c5")), size("0,7 l", "c7", { limon: 60, laimon: 340 }, mohito("c7"))], {
        tip: "Ezing, lekin majaqlamang: qattiq bossangiz, limon po‘sti achchiq bo‘ladi.",
      }),
      item(
        "mohito-klub",
        "Mohito Klub",
        [size("0,5 l", "c5", { limon: 30, laimon: 260, sirop: 30 }, mohito("c5")), size("0,7 l", "c7", { limon: 60, laimon: 300, sirop: 45 }, mohito("c7"))],
        { tip: "Siropni muzdan oldin qo‘shing, shunda u limon sharbati bilan bir tekis aralashadi." },
      ),
    ],
  },
  {
    id: "kokteyl",
    title: "Kokteyl",
    items: [
      item("banan", "Banan", [size("M", "c5", { sut: 200, sirop: 30, banan: 80 }, shake("c5", "banan")), size("L", "c7", { sut: 300, sirop: 45, banan: 155 }, shake("c7", "banan"))], {
        tip: "Qo‘ng‘ir dog‘li pishgan banandan foydalaning: u shirinroq va silliqroq aralashadi.",
      }),
      item("klubnichniy", "Klubnichniy", [size("M", "c5", { sut: 200, sirop: 30, qul: null }, shake("c5", "qul")), size("L", "c7", { sut: 300, sirop: 45, qul: null }, shake("c7", "qul"))], {
        note: "Qulupnay miqdori hali belgilanmagan — menejerdan so‘rang.",
        tip: "Muzlatilgan qulupnay kokteylni sovuqroq va quyuqroq qiladi.",
      }),
      item("choco", "Choco", [size("M", "c5", { sut: 200, sirop: 30 }, shake("c5", "choco")), size("L", "c7", { sut: 300, sirop: 45 }, shake("c7", "choco"))], {
        tip: "Juda sovuq sutdan foydalaning; faqat ko‘pik hosil bo‘lguncha aralashtiring.",
      }),
    ],
  },
  {
    id: "choy",
    title: "Choy",
    note: "Oblepixa, Imbirniy, Yagodniy",
    items: [
      item("choy", "Choy", [size("M", "m", { konst: 30, asal: 40, choy: 1 }, tea("m")), size("L", "l", { konst: 30, asal: 40, choy: 1 }, tea("l"))], {
        tip: "Qopqoqni yopishdan oldin yaxshi aralashtiring: asal va konsentrat tubiga cho‘kadi.",
      }),
    ],
  },
  {
    id: "milkshake",
    title: "Milkshake",
    items: [
      item(
        "milkshake",
        "Milkshake",
        [size("M", "c5", { smes: 310, sut: 150, sirop: 30 }, milkshake("c5"), false), size("L", "c7", { smes: 480, sut: 240, sirop: 30 }, milkshake("c7"), false)],
        { tip: "Sovuq sutdan foydalaning va qisqa aralashtiring: uzoq aralashtirish shekni isitadi va suyultiradi." },
      ),
    ],
  },
  {
    id: "muzqaymoq",
    title: "Muzqaymoq",
    items: [
      item("vafli", "Vafli", [size("kichik", "cone", { smes: 100 }, cone, false), size("katta", "cone", { smes: 140 }, cone, false)], {
        tip: "Konusni uchiga yaqin ushlang va nasadka ostida sekin aylantiring.",
      }),
      item("stakan", "Stakan", [size("kichik", "icup", { smes: 100 }, icup, false), size("katta", "icup", { smes: 140 }, icup, false)], {
        tip: "Avval stakanchani to‘ldiring, so‘ng chetidan yuqorida spiral yasang.",
      }),
    ],
  },
];

export const RECIPE_BOOK: RecipeBook = {
  rules: [
    { title: "Issiq ichimlik asosi", big: "Stakan + qopqoq + 29 g shakar", text: "Shakar mehmonga alohida beriladi. Kakaoda 17,5 g. Raf va Ice Rafda shakar yo‘q." },
    { title: "Stakan hajmlari", big: "S 0,25 · M 0,35 · L 0,45", text: "Issiq ichimliklar kraft stakanda. Sovuq ichimliklarda M = 0,5 l, L = 0,7 l shaffof stakan." },
    { title: "Kofe miqdori", big: "Odatda 18 g", text: "Faqat 4 ta joyda 9 g: Cappuccino S, Americano S, Latte M, Raf S." },
    { title: "Espresso", big: "18 g → 36 g, 25–30 s", text: "Kofe og‘irligidan ikki baravar espresso. Tez oqsa — maydaroq, sekin oqsa — yirikroq torting." },
    { title: "Sirop", big: "M 30 g · L 45 g", text: "Kokteyl va Mohito Klubda. Istisnolar: Raf 25 / 30 / 60 g, Milkshake har doim 30 g." },
    { title: "Mohito", big: "Limon 30 g / 60 g", text: "0,5 l stakanda 30 g, 0,7 l stakanda 60 g limon. Qolgani Laimon Fresh." },
  ],
  categories: CATEGORIES,
};
