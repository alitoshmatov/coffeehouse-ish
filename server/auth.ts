import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

const COOKIE = "ish_admin";
const TTL_MS = 14 * 24 * 3600_000;

const sign = (payload: string) => createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const checkPassword = (pw: string) =>
  safeEqual(sign(`pw:${pw}`), sign(`pw:${config.adminPassword}`));

export function issueSession(res: Response) {
  const exp = String(Date.now() + TTL_MS);
  res.cookie(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: TTL_MS,
    path: "/",
  });
}

export const clearSession = (res: Response) => res.clearCookie(COOKIE, { path: "/" });

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export function isAdmin(req: Request) {
  const [exp, sig] = readCookie(req, COOKIE).split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Kirish talab qilinadi" });
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
