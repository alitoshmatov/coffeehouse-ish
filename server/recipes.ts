import type { CupKind, RecipeBook, RecipeCategory, RecipeItem, RecipeLine, RecipeSize, SceneLayer, SceneOp } from "../src/shared/types";

/**
 * House recipes from the cost sheet ("Coffee House tan narx"), without prices.
 * Amounts per drink. Method steps follow the Barista school course.
 * Kept on the server so only trial baristas receive them (GET /api/recipes).
 * Every step also says what it does to the drink picture (scene ops, drawn by CupScene.tsx).
 */

type Cup = CupKind;
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
  myata: ["Yalpiz (myata)", "barg"],
  laimon: ["Laimon Fresh", "ml"],
  banan: ["Banan", "g"],
  konst: ["Choy konsentrat", "g"],
  asal: ["Asal", "g"],
  choy: ["Choy paketchasi", "dona"],
  smes: ["Smes (muzqaymoq)", "g"],
  qul: ["Qulupnay", "g"],
} as const;
type Key = keyof typeof ING;
type Ing = Partial<Record<Key, number | string | null>>;
type Z = Record<Key, number>;

const n = (v: number) => String(v).replace(".", ",");

/* ── picture helpers ── */
type St = { t: string; ops: SceneOp[] };
const st = (t: string, ...ops: SceneOp[]): St => ({ t, ops });
const CAP: Record<Cup, number> = { s: 250, m: 350, l: 450, c5: 500, c7: 700, cone: 160, icup: 160 };
const L = (key: Key | "suv" | "choysuv" | "muz", vol: number, amount?: string): SceneLayer => {
  const known = key in ING ? ING[key as Key] : null;
  return { key, label: known ? known[0] : key === "suv" ? "Suv" : key === "muz" ? "Muz" : "Issiq suv", vol, amount: amount ?? (known ? `${n(vol)} ${known[1]}` : "") };
};
/** Espresso yield: 2–2,5 × the coffee dose. */
const out = (g: number) => `${n(g * 2)}–${n(g * 2.5)} g`;
const esp = (g: number): SceneLayer => ({ key: "kofe", label: "Espresso", vol: g * 2, amount: `${g} g kofe → ${out(g)}` });
const toCup = (layer: SceneLayer): SceneOp => ({ op: "add", to: "cup", layer });
const toPitcher = (layer: SceneLayer): SceneOp => ({ op: "add", to: "pitcher", layer });
const toBlender = (layer: SceneLayer): SceneOp => ({ op: "add", to: "blender", layer });
const pour = (foam: number, label: string): SceneOp => ({ op: "pour", foam, label });

/* ── step texts ── */
const take = (c: Cup) => st(`${CUP[c]} oling.`, { op: "cup" });
const grind = (g: number) => st(`Portafiltrga (xolderga) ${g} g kofe torting, tekislang va bir tekis bosing.`, { op: "grind", amount: `${g} g` });
const shotCup = (g: number) => st(`Espresso tayyorlang (${g} g kofe → ${out(g)} espresso, 25–30 s) va stakanga quying.`, toCup(esp(g)));
const shotOver = (g: number) => st(`Espresso tayyorlang (${g} g → ${out(g)}) va ustidan sekin quying.`, toCup(esp(g)));
const lidHot = (_z: Z) => st("Qopqoqni yoping.", { op: "lid" });
const lidCold = (_z: Z) => st("Gumbaz qopqoqni yoping va trubochka qo‘ying.", { op: "lid" });
const ice = () => st("Stakanni taxminan uchdan ikki qismigacha muz bilan to‘ldiring.", { op: "ice" });

function size(label: string, cup: Cup, ing: Ing, steps: (z: Z) => St[], lid = true): RecipeSize {
  const lines: RecipeLine[] = [{ name: "Stakan", amount: CUP[cup], base: true }];
  if (lid) lines.push({ name: "Qopqoq va h.k.", amount: "1 dona", base: true });
  const keys = Object.keys(ing) as Key[];
  for (const k of keys) {
    const [name, unit] = ING[k];
    const q = ing[k];
    lines.push(
      q == null
        ? { name, amount: "miqdori hali belgilanmagan" }
        : typeof q === "string"
          ? { name, amount: q }
          : { name, amount: `${n(q)} ${unit}`, qty: q, unit },
    );
  }
  const all = steps(ing as unknown as Z);
  return { size: label, cup: CUP[cup], lines, steps: all.map((x) => x.t), cupKind: cup, scene: all.map((x) => x.ops) };
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
  st(`Qo‘sh espresso tayyorlang: 25–30 s da ${out(z.kofe)} (kofe og‘irligidan 2–2,5 baravar), to‘g‘ridan-to‘g‘ri stakanga.`, toCup(esp(z.kofe))),
  lidHot(z),
];

const milkDrink = (foam: number, steam: (ml: number) => string, pourText: string) => (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  shotCup(z.kofe),
  st(steam(z.sut), toPitcher(L("sut", z.sut)), { op: "steam" }),
  st(pourText, pour(foam, "Bug‘langan sut")),
  lidHot(z),
];
const cappuccino = milkDrink(
  0.4,
  (ml) => `${ml} ml sovuq sutni qalin ko‘pik bilan (taxminan 1,5 sm) 60–65 °C gacha bug‘lang.`,
  "Sutni espressoga quying: avval aralashishi uchun balanddan, so‘ng ko‘pik ustida qolishi uchun pastdan.",
);
const americano = (c: Cup) => (z: Z) => [
  take(c),
  st(
    "Stakanga dispenserdan issiq suv (92–96 °C) quying, tepada espresso uchun joy qoldiring.",
    toCup(L("suv", Math.round(CAP[c] * 0.62), "tepada joy qoldirib")),
  ),
  grind(z.kofe),
  st(`Espresso tayyorlang (${z.kofe} g → ${out(z.kofe)}) va krema ustida qolishi uchun suv ustidan quying.`, toCup(esp(z.kofe))),
  lidHot(z),
];
const latte = (c: Cup) => (z: Z) => [
  take(c),
  st(`${z.sut} ml sovuq sutni yupqa, yaltiroq ko‘pik bilan (taxminan 0,5–1 sm) 60–65 °C gacha bug‘lang.`, toPitcher(L("sut", z.sut)), { op: "steam" }),
  st("Bug‘langan sutni avval stakanga quying.", pour(0.12, "Bug‘langan sut")),
  grind(z.kofe),
  st(`Espresso tayyorlang (${z.kofe} g → ${out(z.kofe)}) va sut ustidan, o‘rtasiga sekin quying.`, toCup(esp(z.kofe))),
  lidHot(z),
];
const raf = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  st(`Espressoni (${z.kofe} g → ${out(z.kofe)}) sut pitcheriga tayyorlang.`, toPitcher(esp(z.kofe))),
  st(
    `Pitcherga ${z.sut} ml sut, ${z.slivki} ml slivki va ${z.sirop} g sirop qo‘shing.`,
    toPitcher(L("sut", z.sut)),
    toPitcher(L("slivki", z.slivki)),
    toPitcher(L("sirop", z.sirop)),
  ),
  st("Hammasini birga kremsimon bo‘lguncha, yengil ko‘pik bilan 60–65 °C gacha bug‘lang. Slivkini qaynatmang.", { op: "steam" }),
  st("Stakanga quying.", pour(0.18, "Raf")),
  lidHot(z),
];
const flatWhite = milkDrink(
  0.08,
  (ml) => `${ml} ml sovuq sutni juda yupqa, ipakdek mikroko‘pik bilan (taxminan 0,5 sm) 60–65 °C gacha bug‘lang.`,
  "Sirtga yaqin, sekin quying va kichik yurak bilan tugating.",
);
const cocoa = (c: Cup) => (z: Z) => [
  take(c),
  st(`Stakanga ${z.kakao} g kakao kukuni soling.`, toCup(L("kakao", z.kakao))),
  st("Ozgina issiq sut qo‘shing va bo‘laksiz silliq pasta bo‘lguncha aralashtiring.", toCup(L("sut", 20, "ozgina")), { op: "stir", label: "Kakao pastasi" }),
  st(`Qolgan sutni (jami ≈ ${z.sut} ml) ozgina ko‘pik bilan taxminan 80 °C gacha bug‘lang (65 °C dan issiqroq).`, toPitcher(L("sut", z.sut - 20, `≈ ${z.sut - 20} ml`)), { op: "steam" }),
  st("Aralashtirib turib quying va ustida ko‘pik bilan tugating.", pour(0.12, "Bug‘langan sut")),
  lidHot(z),
];

/* ── ice coffee ── */
const iceAmericano = (c: Cup) => (z: Z) => [
  take(c),
  ice(),
  st("Sovuq suv qo‘shing, tepada espresso uchun joy qoldiring.", toCup(L("suv", Math.round(CAP[c] * 0.45), "tepada joy qoldirib"))),
  grind(z.kofe),
  shotOver(z.kofe),
  lidCold(z),
];
const iceCappuccino = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  st(`Espresso tayyorlang (${z.kofe} g → ${out(z.kofe)}) va blender idishiga quying.`, toBlender(esp(z.kofe))),
  st(`Blender idishiga muz va ${z.sut} ml sovuq sut qo‘shing.`, toBlender(L("muz", 100, "bir hovuch")), toBlender(L("sut", z.sut))),
  st("Qalin ko‘pik hosil bo‘lguncha blenderda aralashtiring.", { op: "blend" }),
  st("Stakanga quying.", pour(0.35, "Ice Cappuccino")),
  lidCold(z),
];
const iceLatte = (c: Cup) => (z: Z) => [
  take(c),
  ice(),
  st(`Muz ustiga ${z.sut} ml sovuq sut quying.`, toCup(L("sut", z.sut))),
  grind(z.kofe),
  st(`Espresso tayyorlang (${z.kofe} g → ${out(z.kofe)}) va qatlamli ko‘rinish uchun qoshiq orqasidan sekin quying.`, toCup(esp(z.kofe))),
  lidCold(z),
];
const iceRaf = (c: Cup) => (z: Z) => [
  take(c),
  grind(z.kofe),
  st(
    `Blender idishiga muz, ${z.sut} ml sovuq sut, ${z.slivki} ml slivki va espresso (${z.kofe} g → ${out(z.kofe)}) soling.`,
    toBlender(L("muz", 100, "bir hovuch")),
    toBlender(L("sut", z.sut)),
    toBlender(L("slivki", z.slivki)),
    toBlender(esp(z.kofe)),
  ),
  st("Hammasini blenderda ko‘piklanguncha aralashtiring.", { op: "blend" }),
  st("Stakanga quying.", pour(0.06, "Ice Raf")),
  lidCold(z),
];

/* ── mohito, cocktails, tea, milkshake, ice cream ── */
const mohito = (c: Cup) => (z: Z) => [
  take(c),
  st(
    `${z.limon} g limonni ${c === "c5" ? 2 : 4} ta yarim oy shaklidagi bo‘lakka kesib, stakanga soling.`,
    { op: "slices", amount: `${c === "c5" ? 2 : 4} bo‘lak (${z.limon} g)` },
  ),
  st("5–6 ta yalpiz (myata) bargini qo‘shing."),
  st("Sharbat chiqishi uchun limon va yalpizni madler bilan ezing."),
  ...(z.sirop ? [st(`${z.sirop} g sirop qo‘shing.`, toCup(L("sirop", z.sirop)))] : []),
  ice(),
  st(`${z.laimon} ml sovuq Laimon Fresh quying va tubidan sekin aralashtiring.`, toCup(L("laimon", z.laimon))),
  lidCold(z),
];
const shake = (c: Cup, kind: "banan" | "qul" | "choco") => (z: Z) => [
  take(c),
  st(`Blender idishiga ${z.sut} ml sovuq sut quying.`, toBlender(L("sut", z.sut))),
  st("Muz qo‘shing.", toBlender(L("muz", 80, "bir hovuch"))),
  ...(kind === "banan" ? [st(`${z.banan} g bananni tozalab, bo‘laklarga bo‘ling va qo‘shing.`, toBlender(L("banan", z.banan)))] : []),
  ...(kind === "qul" ? [st("Yuvilgan qulupnayni qo‘shing.", toBlender({ ...L("qul", 60), amount: "miqdori hali belgilanmagan" }))] : []),
  st(kind === "choco" ? `${z.sirop} g shokolad siropi qo‘shing.` : `${z.sirop} g sirop qo‘shing.`, toBlender(L("sirop", z.sirop))),
  st("Silliq bo‘lguncha 30–40 s aralashtiring.", { op: "blend" }),
  st("Stakanga quying.", pour(0.08, "Kokteyl")),
  lidCold(z),
];
const tea = (c: Cup) => (z: Z) => [
  take(c),
  st("Qaysi ta’mni so‘rang: oblepixa, imbirniy yoki yagodniy."),
  st(`Stakanga ${z.konst} g choy konsentrati va ${z.asal} g asal soling.`, toCup(L("konst", z.konst)), toCup(L("asal", z.asal))),
  st("Choy paketchasini qo‘shing.", { op: "teabag" }),
  st("Chetidan 1 sm pastgacha issiq suv (taxminan 95 °C) quying.", toCup(L("choysuv", Math.round(CAP[c] * 0.72), "chetidan 1 sm pastgacha"))),
  st("Asal eriguncha aralashtiring, so‘ng qopqoqni yoping.", { op: "stir", label: "Choy" }, { op: "lid" }),
];
const milkshake = (c: Cup) => (z: Z) => [
  take(c),
  st(`Blender idishini muzqaymoq mashinasidan ${z.smes} g muzqaymoq bilan to‘ldiring.`, toBlender(L("smes", z.smes))),
  st(`${z.sut} ml sovuq sut va ${z.sirop} g sirop qo‘shing.`, toBlender(L("sut", z.sut)), toBlender(L("sirop", z.sirop))),
  st("Quyuq va silliq bo‘lguncha 20–30 s aralashtiring.", { op: "blend" }),
  st("Stakanga quying.", pour(0.1, "Milkshake")),
  lidCold(z),
];
const cone = (z: Z) => [
  take("cone"),
  st(`Richagni torting va konusni ${z.smes} g muzqaymoq bilan zich spiral qilib aylantirib to‘ldiring.`, toCup(L("smes", z.smes))),
  st("Darhol salfetka bilan bering."),
];
const icup = (z: Z) => [
  take("icup"),
  st(`Richagni torting va stakanchani ${z.smes} g muzqaymoq bilan to‘ldiring, so‘ng ustida spiral bilan tugating.`, toCup(L("smes", z.smes))),
  st("Qoshiq qo‘ying va bering."),
];

const CATEGORIES: RecipeCategory[] = [
  {
    id: "kofe",
    title: "Kofe",
    items: [
      item("espresso", "Espresso", [size("S", "s", { kofe: 18 }, espresso("s"))], {
        tip: "Bir daqiqa ichida bering: krema tez yo‘qoladi.",
      }),
      item(
        "cappuccino",
        "Cappuccino",
        [
          size("S", "s", { kofe: 9, sut: 200 }, cappuccino("s")),
          size("M", "m", { kofe: 18, sut: 280 }, cappuccino("m")),
          size("L", "l", { kofe: 18, sut: 380 }, cappuccino("l")),
        ],
        { tip: "Cappuccino menyudagi eng qalin ko‘pikka ega, taxminan 1,5 sm. To‘la stakan hajmiga nisbatan yengil bo‘lishi kerak." },
      ),
      item(
        "americano",
        "Americano",
        [
          size("S", "s", { kofe: 9 }, americano("s")),
          size("M", "m", { kofe: 18 }, americano("m")),
          size("L", "l", { kofe: 18 }, americano("l")),
        ],
        { tip: "Avval suv, keyin espresso: krema saqlanadi va ichimlik kamroq achchiq bo‘ladi." },
      ),
      item(
        "latte",
        "Latte",
        [size("M", "m", { kofe: 9, sut: 260 }, latte("m")), size("L", "l", { kofe: 18, sut: 380 }, latte("l"))],
        { tip: "Latteda avval sut, keyin espresso quyiladi. Ko‘pik cappuccinodan kam bo‘ladi." },
      ),
      item(
        "raf",
        "Raf",
        [
          size("S", "s", { kofe: 9, sut: 100, sirop: 25, slivki: 50 }, raf("s")),
          size("M", "m", { kofe: 18, sut: 130, sirop: 30, slivki: 100 }, raf("m")),
          size("L", "l", { kofe: 18, sut: 200, sirop: 60, slivki: 100 }, raf("l")),
        ],
        { tip: "Raf espresso bilan birga pitcherda bug‘lanadi, shuning uchun u silliq va shirin." },
      ),
      item("flat-white", "Flat White", [size("S", "s", { kofe: 18, sut: 190 }, flatWhite("s"))], {
        tip: "Flat White menyudagi eng kuchli sutli kofe: kichik stakanda qo‘sh shot va deyarli ko‘piksiz.",
      }),
    ],
  },
  {
    id: "kakao",
    title: "Kakao",
    items: [
      item("goryachiy-shokolad", "Goryachiy shokolad", [size("S", "s", { kakao: 20, sut: 120 }, cocoa("s"))], {
        tip: "Issiq shokoladda kakaodan kamroq sut bor, shuning uchun u quyuqroq.",
      }),
      item("kakao", "Kakao", [size("M", "m", { kakao: 20, sut: 150 }, cocoa("m"))], {
        tip: "Avval pasta tayyorlang: to‘g‘ridan-to‘g‘ri issiq sutga solingan kakao quruq bo‘lak bo‘lib suzib yuradi.",
      }),
    ],
  },
  {
    id: "ice",
    title: "Ice Coffee",
    items: [
      item("ice-americano", "Ice Americano", [size("M", "c5", { kofe: 18 }, iceAmericano("c5")), size("L", "c7", { kofe: 18 }, iceAmericano("c7"))], {
        tip: "Espressoni oxirida va sekin muz ustiga quying: u darhol soviydi va hidini saqlaydi.",
      }),
      item(
        "ice-cappuccino",
        "Ice Cappuccino",
        [size("M", "c5", { kofe: 18, sut: 200 }, iceCappuccino("c5")), size("L", "c7", { kofe: 18, sut: 300 }, iceCappuccino("c7"))],
        { tip: "Ice Cappuccino blenderda tayyorlanadi: muz, sut va espresso birga aralashib, qalin ko‘pik hosil qiladi. So‘ng stakanga quyiladi." },
      ),
      item("ice-latte", "Ice Latte", [size("M", "c5", { kofe: 18, sut: 290 }, iceLatte("c5")), size("L", "c7", { kofe: 18, sut: 340 }, iceLatte("c7"))], {
        tip: "Espressoni sekin quying: u sovuq sut ustida suzib, mehmonlar yoqtiradigan qatlamlarni hosil qiladi.",
      }),
      item("ice-raf", "Ice Raf", [size("M", "c5", { kofe: 18, sut: 150, slivki: 100 }, iceRaf("c5")), size("L", "c7", { kofe: 18, sut: 250, slivki: 100 }, iceRaf("c7"))], {
        tip: "Muz ham blenderga solinadi: hammasi birga aralashtirilib, keyin stakanga quyiladi.",
      }),
    ],
  },
  {
    id: "mohito",
    title: "Mohito",
    items: [
      item("mohito", "Mohito", [size("0,5 l", "c5", { limon: 30, myata: "5–6 barg", laimon: 290 }, mohito("c5")), size("0,7 l", "c7", { limon: 60, myata: "5–6 barg", laimon: 340 }, mohito("c7"))], {
        tip: "Ezing, lekin majaqlamang: qattiq bossangiz, limon po‘sti achchiq bo‘ladi.",
        note: "Xohishga ko‘ra apelsin bo‘lagi ham qo‘shish mumkin — shart emas.",
      }),
      item(
        "mohito-klub",
        "Mohito Klub",
        [size("0,5 l", "c5", { limon: 30, myata: "5–6 barg", laimon: 260, sirop: 30 }, mohito("c5")), size("0,7 l", "c7", { limon: 60, myata: "5–6 barg", laimon: 300, sirop: 45 }, mohito("c7"))],
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
    { title: "Stakan hajmlari", big: "S 0,25 · M 0,35 · L 0,45", text: "Issiq ichimliklar kraft stakanda. Sovuq ichimliklarda M = 0,5 l, L = 0,7 l shaffof stakan." },
    { title: "Kofe miqdori", big: "Odatda 18 g", text: "Faqat 4 ta joyda 9 g: Cappuccino S, Americano S, Latte M, Raf S." },
    { title: "Espresso", big: "18 g → 36–45 g, 25–30 s", text: "Espresso kofe og‘irligidan 2–2,5 baravar chiqadi. Tez oqsa — maydaroq, sekin oqsa — yirikroq torting." },
    { title: "Sirop", big: "M 30 g · L 45 g", text: "Kokteyl va Mohito Klubda. Istisnolar: Raf 25 / 30 / 60 g, Milkshake har doim 30 g." },
    { title: "Mohito", big: "Limon 2 / 4 bo‘lak", text: "0,5 l stakanda 2 ta (30 g), 0,7 l stakanda 4 ta (60 g) yarim oy bo‘lak limon va 5–6 ta yalpiz bargi. Apelsin — xohishga ko‘ra. Qolgani Laimon Fresh." },
  ],
  categories: CATEGORIES,
};
