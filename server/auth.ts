import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import * as db from "./db";

const COOKIE = "ish_admin";
const TTL_MS = 14 * 24 * 3600_000;
export const OWNER_USERNAME = "admin";

/* ─────────────────────────────── Passwords ─────────────────────────────── */

export function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(pw, salt, 32).toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(pw, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(got, expected);
}

/**
 * The main admin ("admin") always exists and its password always equals ADMIN_PASSWORD.
 * Changing the env var in Coolify and redeploying is how the owner password is reset.
 */
export function ensureOwner() {
  const owner = db.getAdminByUsername(OWNER_USERNAME);
  if (!owner) {
    db.createAdmin({ name: "Bosh admin", username: OWNER_USERNAME, passwordHash: hashPassword(config.adminPassword), role: "owner" });
  } else if (!verifyPassword(config.adminPassword, owner.passwordHash) || !owner.active) {
    db.updateAdmin(owner.id, { passwordHash: hashPassword(config.adminPassword), active: true });
  }
}

/* ──────────────────────────────── Sessions ──────────────────────────────── */

const sign = (payload: string) => createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function issueSession(res: Response, admin: db.AdminRow) {
  const payload = `${admin.id}.${admin.sessionVersion}.${Date.now() + TTL_MS}`;
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: TTL_MS,
    path: "/",
  });
}

export const clearSession = (res: Response) => res.clearCookie(COOKIE, { path: "/" });

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/** The logged-in admin, or null. Blocked admins and changed passwords end the session. */
export function currentAdmin(req: Request) {
  const parts = readCookie(req, COOKIE).split(".");
  if (parts.length !== 4) return null;
  const [id, version, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${id}.${version}.${exp}`)) || Number(exp) < Date.now()) return null;
  const admin = db.getAdmin(Number(id));
  if (!admin || !admin.active || admin.sessionVersion !== Number(version)) return null;
  return admin;
}

export type AdminReq = Request & { admin?: db.AdminRow };

export function requireAdmin(req: AdminReq, res: Response, next: NextFunction) {
  const admin = currentAdmin(req);
  if (!admin) return res.status(401).json({ error: "Kirish talab qilinadi" });
  req.admin = admin;
  next();
}

export function requireOwner(req: AdminReq, res: Response, next: NextFunction) {
  if (req.admin?.role !== "owner") return res.status(403).json({ error: "Faqat bosh admin uchun." });
  next();
}

/** Tiny in-memory limiter for the login endpoint: 5 tries / 10 min per IP. */
const attempts = new Map<string, { n: number; until: number }>();
export function loginLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "?";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 5)
    return res.status(429).json({ error: "Ko‘p urinish. 10 daqiqadan keyin qayta urinib ko‘ring." });
  if (!a || a.until <= now) attempts.set(ip, { n: 1, until: now + 10 * 60_000 });
  else a.n++;
  next();
}
export const resetLimiter = (req: Request) => attempts.delete(req.ip || "?");
