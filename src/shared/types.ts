export type Status = "new" | "interview" | "rejected";

export const STATUS_LABEL: Record<Status, string> = {
  new: "Yangi",
  interview: "Suhbatga taklif qilingan",
  rejected: "Rad etilgan",
};

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
  tgId: number;
  tgUsername: string | null;
  status: Status;
  interviewAt: string | null; // "2026-11-03T10:00" local Tashkent time
  interviewPlace: string | null;
  managerNote: string | null; // shown to the applicant in the bot message
  internalNote: string | null; // manager-only
  notified: boolean; // bot message delivered
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Applicant's own view — no internal notes. */
export type MyApplication = Omit<Application, "internalNote" | "tgId">;

export const LIMITS = { text: 600, name: 80, phone: 20, minAge: 18, maxAge: 70 };

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
