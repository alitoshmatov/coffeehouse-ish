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
  trialStartAt: string | null; // first trial work day, "2026-11-10T05:00" Tashkent time
  managerNote: string | null; // shown to the applicant in the bot message
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
