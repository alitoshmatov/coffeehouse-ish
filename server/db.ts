import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config";
import type { AdminRole, AdminUser, Application, ApplicationInput, InterviewResponse, Round, RoundSummary, Status } from "../src/shared/types";
import { DEFAULT_CONTENT, type JobContent } from "../src/shared/hiring";

mkdirSync(dirname(config.dbPath), { recursive: true });

/**
 * Is the database folder on its own mount (a Docker volume) rather than the container's
 * throwaway filesystem? Reads /proc/self/mountinfo (Linux). null = can't tell (e.g. macOS dev).
 */
function checkPersistent(): { path: string; mount: string | null; persistent: boolean | null } {
  const path = resolve(config.dbPath);
  try {
    const mounts = readFileSync("/proc/self/mountinfo", "utf8")
      .split("\n")
      .map((l) => l.split(" ")[4])
      .filter(Boolean);
    const dir = dirname(path);
    const mount = mounts
      .filter((m) => dir === m || dir.startsWith(m === "/" ? "/" : `${m}/`))
      .sort((a, b) => b.length - a.length)[0];
    return { path, mount: mount ?? null, persistent: !!mount && mount !== "/" };
  } catch {
    return { path, mount: null, persistent: null };
  }
}

export const storage = checkPersistent();
if (storage.persistent === false && config.isProd) {
  console.warn(
    `⚠️  DATABASE IS NOT ON A PERSISTENT VOLUME: ${storage.path}\n` +
      `   All applications, admins and settings will be LOST on the next deploy.\n` +
      `   Fix: in Coolify add Persistent Storage → Volume, destination path /data,\n` +
      `   and remove any DB_PATH environment variable (default is /data/ish.db). Then redeploy.`,
  );
} else {
  console.log(`Database: ${storage.path}${storage.persistent ? ` (persistent volume at ${storage.mount})` : ""}`);
}
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
  CREATE TABLE IF NOT EXISTS rounds (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    open              INTEGER NOT NULL DEFAULT 0,
    content           TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    created_by        TEXT,
    content_edited_by TEXT,
    content_edited_at TEXT
  );
  CREATE TABLE IF NOT EXISTS admins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'hr',
    active          INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    last_login_at   TEXT
  );
`);

// Migrations for databases created before a column existed
const columns = new Set((db.prepare(`PRAGMA table_info(applications)`).all() as { name: string }[]).map((c) => c.name));
for (const [name, type] of [
  ["interview_response", "TEXT"],
  ["response_note", "TEXT"],
  ["responded_at", "TEXT"],
  ["trial_start_at", "TEXT"],
  ["decided_by", "TEXT"],
  ["round_id", "INTEGER"],
] as const) {
  if (!columns.has(name)) db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${type}`);
}

type Row = Record<string, unknown>;
const toApp = (r: Row): Application => ({
  id: Number(r.id),
  roundId: Number(r.round_id),
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
  decidedBy: (r.decided_by as string) ?? null,
  notified: Number(r.notified) === 1,
  interviewResponse: (r.interview_response as InterviewResponse) ?? null,
  responseNote: (r.response_note as string) ?? null,
  respondedAt: (r.responded_at as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function createApplication(roundId: number, tgId: number, tgUsername: string | null, a: ApplicationInput) {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO applications (round_id, tg_id, tg_username, full_name, phone, age, current_duties, experience, why_us, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(roundId, tgId, tgUsername, a.fullName, a.phone, a.age, a.currentDuties, a.experience, a.whyUs, now, now);
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

export function listApplications(roundId: number) {
  return (db.prepare(`SELECT * FROM applications WHERE round_id = ? ORDER BY id DESC`).all(roundId) as Row[]).map(toApp);
}

export function countByStatus(roundId: number) {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM applications WHERE round_id = ? GROUP BY status`)
    .all(roundId) as Row[];
  const out: Record<Status, number> = { new: 0, interview: 0, trial: 0, rejected: 0 };
  for (const r of rows) out[r.status as Status] = Number(r.n);
  return out;
}

export function updateDecision(
  id: number,
  d: { status: Status; interviewAt?: string | null; interviewPlace?: string | null; managerNote?: string | null },
  decidedBy: string | null = null,
) {
  db.prepare(
    `UPDATE applications SET status = ?, interview_at = ?, interview_place = ?, manager_note = ?, notified = 0,
       interview_response = NULL, response_note = NULL, responded_at = NULL, trial_start_at = NULL, decided_by = ?,
       updated_at = ? WHERE id = ?`,
  ).run(d.status, d.interviewAt ?? null, d.interviewPlace ?? null, d.managerNote ?? null, decidedBy, new Date().toISOString(), id);
  return getApplication(id);
}

/** Reject, keeping interview/trial details so the message and history stay accurate. */
export function reject(id: number, managerNote: string | null, decidedBy: string | null = null) {
  db.prepare(
    `UPDATE applications SET status = 'rejected', manager_note = ?, notified = 0, decided_by = ?, updated_at = ? WHERE id = ?`,
  ).run(managerNote, decidedBy, new Date().toISOString(), id);
  return getApplication(id)!;
}

/** Move a candidate into the trial period. Interview details are kept for the record. */
export function startTrial(id: number, trialStartAt: string, managerNote: string | null, decidedBy: string | null = null) {
  db.prepare(
    `UPDATE applications SET status = 'trial', trial_start_at = ?, manager_note = ?, notified = 0, decided_by = ?, updated_at = ? WHERE id = ?`,
  ).run(trialStartAt, managerNote, decidedBy, new Date().toISOString(), id);
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
export function countRescheduleRequests(roundId: number) {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n FROM applications WHERE round_id = ? AND status = 'interview' AND interview_response = 'reschedule'`,
    )
    .get(roundId) as Row;
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


/* ──────────────────────────── Rounds (Qabul) ──────────────────────────── */

const parseContent = (raw: unknown): JobContent => {
  try {
    return { ...DEFAULT_CONTENT, ...JSON.parse(String(raw)) };
  } catch {
    return DEFAULT_CONTENT;
  }
};

const toRound = (r: Row): Round => ({
  id: Number(r.id),
  name: r.name as string,
  open: Number(r.open) === 1,
  content: parseContent(r.content),
  createdAt: r.created_at as string,
  createdBy: (r.created_by as string) ?? null,
  contentEditedBy: (r.content_edited_by as string) ?? null,
  contentEditedAt: (r.content_edited_at as string) ?? null,
});

export function getRound(id: number) {
  const r = db.prepare(`SELECT * FROM rounds WHERE id = ?`).get(id) as Row | undefined;
  return r ? toRound(r) : null;
}

export function listRounds(): RoundSummary[] {
  return (db.prepare(`SELECT * FROM rounds ORDER BY id DESC`).all() as Row[]).map((r) => {
    const round = toRound(r);
    return { ...round, counts: countByStatus(round.id), rescheduleRequests: countRescheduleRequests(round.id) };
  });
}

export const openRounds = () =>
  (db.prepare(`SELECT * FROM rounds WHERE open = 1 ORDER BY id DESC`).all() as Row[]).map(toRound);

export function createRound(r: { name: string; content: JobContent; open: boolean; createdBy: string }) {
  const res = db
    .prepare(`INSERT INTO rounds (name, open, content, created_at, created_by) VALUES (?, ?, ?, ?, ?)`)
    .run(r.name, r.open ? 1 : 0, JSON.stringify(r.content), new Date().toISOString(), r.createdBy);
  return getRound(Number(res.lastInsertRowid))!;
}

export function updateRound(id: number, patch: { name?: string; open?: boolean }) {
  const cur = getRound(id);
  if (!cur) return null;
  db.prepare(`UPDATE rounds SET name = ?, open = ? WHERE id = ?`).run(
    patch.name ?? cur.name,
    (patch.open ?? cur.open) ? 1 : 0,
    id,
  );
  return getRound(id);
}

export function setRoundContent(id: number, content: JobContent, editedBy: string) {
  db.prepare(`UPDATE rounds SET content = ?, content_edited_by = ?, content_edited_at = ? WHERE id = ?`).run(
    JSON.stringify(content),
    editedBy,
    new Date().toISOString(),
    id,
  );
  return getRound(id);
}

/** Only empty rounds can be deleted — applications are never thrown away. */
export function deleteRound(id: number) {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM applications WHERE round_id = ?`).get(id) as Row;
  if (Number(n.n) > 0) return false;
  db.prepare(`DELETE FROM rounds WHERE id = ?`).run(id);
  return true;
}

/**
 * Before rounds existed there was one job post (settings.job_content) and one switch
 * (settings.hiring_open). Turn that into round #1 and attach all existing applications to it.
 */
function migrateToRounds() {
  const has = db.prepare(`SELECT COUNT(*) AS n FROM rounds`).get() as Row;
  if (Number(has.n) === 0) {
    const legacy = getSetting("job_content", "");
    const meta = (() => {
      try {
        return JSON.parse(getSetting("job_content_meta", "null")) as { editedBy: string; editedAt: string } | null;
      } catch {
        return null;
      }
    })();
    const round = createRound({
      name: "1-qabul",
      content: legacy ? parseContent(legacy) : DEFAULT_CONTENT,
      open: getSetting("hiring_open", "1") === "1",
      createdBy: "Tizim",
    });
    if (meta) db.prepare(`UPDATE rounds SET content_edited_by = ?, content_edited_at = ? WHERE id = ?`).run(meta.editedBy, meta.editedAt, round.id);
  }
  const first = db.prepare(`SELECT MIN(id) AS id FROM rounds`).get() as Row;
  db.prepare(`UPDATE applications SET round_id = ? WHERE round_id IS NULL`).run(Number(first.id));
}

/* ──────────────────────────────── Admins ──────────────────────────────── */

export interface AdminRow extends AdminUser {
  passwordHash: string;
  sessionVersion: number;
}

const toAdmin = (r: Row): AdminRow => ({
  id: Number(r.id),
  name: r.name as string,
  username: r.username as string,
  role: r.role as AdminRole,
  active: Number(r.active) === 1,
  createdAt: r.created_at as string,
  lastLoginAt: (r.last_login_at as string) ?? null,
  passwordHash: r.password_hash as string,
  sessionVersion: Number(r.session_version),
});

export const publicAdmin = ({ passwordHash: _p, sessionVersion: _s, ...a }: AdminRow): AdminUser => a;

export function getAdmin(id: number) {
  const r = db.prepare(`SELECT * FROM admins WHERE id = ?`).get(id) as Row | undefined;
  return r ? toAdmin(r) : null;
}

export function getAdminByUsername(username: string) {
  const r = db.prepare(`SELECT * FROM admins WHERE username = ?`).get(username) as Row | undefined;
  return r ? toAdmin(r) : null;
}

export function listAdmins() {
  return (db.prepare(`SELECT * FROM admins ORDER BY role = 'owner' DESC, created_at`).all() as Row[]).map(toAdmin);
}

export function createAdmin(a: { name: string; username: string; passwordHash: string; role: AdminRole }) {
  const res = db
    .prepare(`INSERT INTO admins (name, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(a.name, a.username, a.passwordHash, a.role, new Date().toISOString());
  return getAdmin(Number(res.lastInsertRowid))!;
}

export function updateAdmin(id: number, patch: { name?: string; passwordHash?: string; active?: boolean }) {
  const cur = getAdmin(id);
  if (!cur) return null;
  // A new password or blocking signs the person out everywhere
  const bump = patch.passwordHash !== undefined || patch.active === false ? 1 : 0;
  db.prepare(
    `UPDATE admins SET name = ?, password_hash = ?, active = ?, session_version = session_version + ? WHERE id = ?`,
  ).run(
    patch.name ?? cur.name,
    patch.passwordHash ?? cur.passwordHash,
    patch.active === undefined ? (cur.active ? 1 : 0) : patch.active ? 1 : 0,
    bump,
    id,
  );
  return getAdmin(id);
}

export function deleteAdmin(id: number) {
  db.prepare(`DELETE FROM admins WHERE id = ? AND role != 'owner'`).run(id);
}

export function touchLogin(id: number) {
  db.prepare(`UPDATE admins SET last_login_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

migrateToRounds();
