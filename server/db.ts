import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";
import type { Application, ApplicationInput, InterviewResponse, Status } from "../src/shared/types";

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id           INTEGER NOT NULL,
    tg_username     TEXT,
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL,
    age             INTEGER NOT NULL,
    current_duties  TEXT NOT NULL DEFAULT '',
    experience      TEXT NOT NULL DEFAULT '',
    why_us          TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'new',
    interview_at    TEXT,
    interview_place TEXT,
    manager_note    TEXT,
    internal_note   TEXT,
    notified        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_app_tg ON applications(tg_id);
  CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// Migrations for databases created before a column existed
const columns = new Set((db.prepare(`PRAGMA table_info(applications)`).all() as { name: string }[]).map((c) => c.name));
for (const [name, type] of [
  ["interview_response", "TEXT"],
  ["response_note", "TEXT"],
  ["responded_at", "TEXT"],
  ["trial_start_at", "TEXT"],
] as const) {
  if (!columns.has(name)) db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${type}`);
}

type Row = Record<string, unknown>;
const toApp = (r: Row): Application => ({
  id: Number(r.id),
  tgId: Number(r.tg_id),
  tgUsername: (r.tg_username as string) ?? null,
  fullName: r.full_name as string,
  phone: r.phone as string,
  age: Number(r.age),
  currentDuties: r.current_duties as string,
  experience: r.experience as string,
  whyUs: r.why_us as string,
  status: r.status as Status,
  interviewAt: (r.interview_at as string) ?? null,
  interviewPlace: (r.interview_place as string) ?? null,
  trialStartAt: (r.trial_start_at as string) ?? null,
  managerNote: (r.manager_note as string) ?? null,
  internalNote: (r.internal_note as string) ?? null,
  notified: Number(r.notified) === 1,
  interviewResponse: (r.interview_response as InterviewResponse) ?? null,
  responseNote: (r.response_note as string) ?? null,
  respondedAt: (r.responded_at as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function createApplication(tgId: number, tgUsername: string | null, a: ApplicationInput) {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO applications (tg_id, tg_username, full_name, phone, age, current_duties, experience, why_us, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(tgId, tgUsername, a.fullName, a.phone, a.age, a.currentDuties, a.experience, a.whyUs, now, now);
  return getApplication(Number(res.lastInsertRowid))!;
}

export function getApplication(id: number) {
  const r = db.prepare(`SELECT * FROM applications WHERE id = ?`).get(id) as Row | undefined;
  return r ? toApp(r) : null;
}

/** Applicant's most recent application. */
export function latestForUser(tgId: number) {
  const r = db
    .prepare(`SELECT * FROM applications WHERE tg_id = ? ORDER BY id DESC LIMIT 1`)
    .get(tgId) as Row | undefined;
  return r ? toApp(r) : null;
}

export function listApplications(status?: Status) {
  const rows = (
    status
      ? db.prepare(`SELECT * FROM applications WHERE status = ? ORDER BY id DESC`).all(status)
      : db.prepare(`SELECT * FROM applications ORDER BY id DESC`).all()
  ) as Row[];
  return rows.map(toApp);
}

export function countByStatus() {
  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM applications GROUP BY status`).all() as Row[];
  const out: Record<Status, number> = { new: 0, interview: 0, trial: 0, rejected: 0 };
  for (const r of rows) out[r.status as Status] = Number(r.n);
  return out;
}

export function updateDecision(
  id: number,
  d: { status: Status; interviewAt?: string | null; interviewPlace?: string | null; managerNote?: string | null },
) {
  db.prepare(
    `UPDATE applications SET status = ?, interview_at = ?, interview_place = ?, manager_note = ?, notified = 0,
       interview_response = NULL, response_note = NULL, responded_at = NULL, trial_start_at = NULL, updated_at = ? WHERE id = ?`,
  ).run(d.status, d.interviewAt ?? null, d.interviewPlace ?? null, d.managerNote ?? null, new Date().toISOString(), id);
  return getApplication(id);
}

/** Reject, keeping interview/trial details so the message and history stay accurate. */
export function reject(id: number, managerNote: string | null) {
  db.prepare(
    `UPDATE applications SET status = 'rejected', manager_note = ?, notified = 0, updated_at = ? WHERE id = ?`,
  ).run(managerNote, new Date().toISOString(), id);
  return getApplication(id)!;
}

/** Move a candidate into the trial period. Interview details are kept for the record. */
export function startTrial(id: number, trialStartAt: string, managerNote: string | null) {
  db.prepare(
    `UPDATE applications SET status = 'trial', trial_start_at = ?, manager_note = ?, notified = 0, updated_at = ? WHERE id = ?`,
  ).run(trialStartAt, managerNote, new Date().toISOString(), id);
  return getApplication(id)!;
}

/** Record the applicant's answer to the interview invitation. */
export function setInterviewResponse(id: number, response: InterviewResponse, note: string | null) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE applications SET interview_response = ?, response_note = ?, responded_at = ?, updated_at = ? WHERE id = ?`,
  ).run(response, note, now, now, id);
  return getApplication(id)!;
}

/** Applications where the candidate asked for another interview time. */
export function countRescheduleRequests() {
  const r = db
    .prepare(`SELECT COUNT(*) AS n FROM applications WHERE status = 'interview' AND interview_response = 'reschedule'`)
    .get() as Row;
  return Number(r.n);
}

export function setNotified(id: number, ok: boolean) {
  db.prepare(`UPDATE applications SET notified = ? WHERE id = ?`).run(ok ? 1 : 0, id);
}

export function setInternalNote(id: number, note: string) {
  db.prepare(`UPDATE applications SET internal_note = ?, updated_at = ? WHERE id = ?`).run(
    note || null,
    new Date().toISOString(),
    id,
  );
  return getApplication(id);
}

export function getSetting(key: string, fallback: string) {
  const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as Row | undefined;
  return r ? (r.value as string) : fallback;
}

export function setSetting(key: string, value: string) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    value,
  );
}

export const isHiringOpen = () => getSetting("hiring_open", "1") === "1";
