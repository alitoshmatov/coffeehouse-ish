import type { JobContent } from "./hiring";

export type Status = "new" | "interview" | "trial" | "rejected";
export const STATUSES: Status[] = ["new", "interview", "trial", "rejected"];

/** Applicant's answer to an interview invitation. */
export type InterviewResponse = "confirmed" | "reschedule";

export const STATUS_LABEL: Record<Status, string> = {
  new: "Yangi",
  interview: "Suhbatga taklif qilingan",
  trial: "Sinov muddatida",
  rejected: "Rad etilgan",
};

export type AdminRole = "owner" | "hr";
export const ROLE_LABEL: Record<AdminRole, string> = { owner: "Bosh admin", hr: "HR" };

export interface AdminUser {
  id: number;
  name: string;
  username: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** A hiring round ("Qabul") with its own job post and applications. */
export interface Round {
  id: number;
  name: string;
  open: boolean;
  content: JobContent;
  createdAt: string;
  createdBy: string | null;
  contentEditedBy: string | null;
  contentEditedAt: string | null;
}

/** Round with per-status application counts, for the admin list. */
export interface RoundSummary extends Round {
  counts: Record<Status, number>;
  rescheduleRequests: number;
}

/** What applicants see of a round. */
export type PublicRound = Pick<Round, "id" | "name" | "content">;

/** What the applicant fills in. */
export interface ApplicationInput {
  fullName: string;
  phone: string;
  age: number;
  currentDuties: string;
  experience: string;
  whyUs: string;
}

export interface Application extends ApplicationInput {
  id: number;
  roundId: number;
  tgId: number;
  tgUsername: string | null;
  status: Status;
  interviewAt: string | null; // "2026-11-03T10:00" local Tashkent time
  interviewPlace: string | null;
  trialStartAt: string | null; // first trial work day, "2026-11-10T05:00" Tashkent time
  managerNote: string | null; // legacy: extra note added to the bot message (before messages were editable)
  sentMessage: string | null; // exact text of the last decision message sent to the candidate
  internalNote: string | null; // manager-only
  decidedBy: string | null; // name of the admin who made the last decision
  notified: boolean; // bot message delivered
  interviewResponse: InterviewResponse | null; // null = no answer yet
  responseNote: string | null; // preferred time when asking to reschedule
  respondedAt: string | null; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Applicant's own view — no internal notes. */
export type MyApplication = Omit<Application, "internalNote" | "tgId" | "decidedBy">;

export const LIMITS = { responseNote: 300, text: 600, name: 80, phone: 20, minAge: 18, maxAge: 70 };

export function validateInput(d: Partial<Record<keyof ApplicationInput, unknown>>) {
  const errors: Partial<Record<keyof ApplicationInput, string>> = {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fullName = s(d.fullName);
  const phone = s(d.phone);
  const age = Number(d.age);

  if (fullName.split(/\s+/).filter(Boolean).length < 2 || fullName.length > LIMITS.name)
    errors.fullName = "Ism va familiyangizni yozing.";
  const digits = phone.replace(/\D/g, "");
  if (!phone) errors.phone = "Telefon raqamingizni kiriting.";
  else if (!/^[+\d\s()-]+$/.test(phone) || digits.length < 9 || digits.length > 12)
    errors.phone = "Telefon raqamni to‘g‘ri kiriting: +998 90 123 45 67";
  if (!Number.isFinite(age)) errors.age = "Yoshingizni kiriting.";
  else if (!Number.isInteger(age) || age < LIMITS.minAge)
    errors.age = "Ishga qabul qilish uchun yosh kamida 18 bo‘lishi kerak.";
  else if (age > LIMITS.maxAge) errors.age = "Yoshni to‘g‘ri kiriting.";
  for (const k of ["currentDuties", "experience", "whyUs"] as const)
    if (s(d[k]).length > LIMITS.text) errors[k] = `Ko‘pi bilan ${LIMITS.text} belgi.`;

  const value: ApplicationInput = {
    fullName,
    phone,
    age,
    currentDuties: s(d.currentDuties),
    experience: s(d.experience),
    whyUs: s(d.whyUs),
  };
  return { errors, value, ok: Object.keys(errors).length === 0 };
}

/* ───────────── Recipe book (served only to trial baristas, see GET /api/recipes) ───────────── */

export interface RecipeLine {
  name: string; // "Sut"
  amount: string; // "280 ml" or "S · 0,25 l kraft stakan"
  qty?: number; // numeric part, for practice questions
  unit?: string;
  base?: boolean; // cup and lid — the same on most drinks
}

export interface RecipeSize {
  size: string; // "M", "0,5 l", "kichik"
  cup: string;
  lines: RecipeLine[];
  steps: string[];
  cupKind: CupKind; // which cup the picture draws
  scene: SceneOp[][]; // scene[i] = what step i does to the picture (same length as steps)
}

/* Picture of a drink being built, step by step (drawn by src/applicant/CupScene.tsx) */
export type CupKind = "s" | "m" | "l" | "c5" | "c7" | "cone" | "icup";
export interface SceneLayer {
  key: string; // colour key: kofe, sut, slivki, sirop, kakao, laimon, banan, qul, konst, asal, suv, choysuv, smes, muz
  label: string; // "Sut"
  vol: number; // ml, only for drawing to scale
  amount: string; // "280 ml"
}
export type SceneOp =
  | { op: "cup" }
  | { op: "grind"; amount: string }
  | { op: "add"; to: "cup" | "pitcher" | "blender"; layer: SceneLayer }
  | { op: "steam"; temp?: string } // pitcher heated, contents mix; temp shown on the thermometer (default 60–65 °C)
  | { op: "blend" } // pitcher/blender contents mix
  | { op: "pour"; foam: number; label: string } // pitcher/blender → cup; foam = share that turns to foam (1 = all)
  | { op: "ice" }
  | { op: "slices"; amount: string }
  | { op: "mint"; amount: string } // mint leaves dropped into the cup
  | { op: "muddle" } // muddler crushes what is in the cup
  | { op: "teabag" }
  | { op: "stir"; label: string } // cup layers mix into one
  | { op: "lid" };

export interface RecipeItem {
  id: string;
  name: string;
  tip?: string;
  note?: string;
  sizes: RecipeSize[];
}

export interface RecipeCategory {
  id: string;
  title: string;
  note?: string;
  items: RecipeItem[];
}

export interface RecipeRule {
  title: string;
  big: string;
  text: string;
}

export interface RecipeBook {
  rules: RecipeRule[];
  categories: RecipeCategory[];
}
