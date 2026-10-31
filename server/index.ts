import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config";
import * as db from "./db";
import { notifyApplicant, notifyManager, recordResponse, startBot, verifyInitData, type TgUser } from "./telegram";
import { checkPassword, clearSession, isAdmin, issueSession, loginLimiter, requireAdmin } from "./auth";
import { LIMITS, STATUSES, validateInput, type Application, type MyApplication, type Status } from "../src/shared/types";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

/* ───────────────────────── Applicant (Telegram mini app) ───────────────────────── */

type TgReq = express.Request & { tgUser?: TgUser };

function requireTelegram(req: TgReq, res: express.Response, next: express.NextFunction) {
  const user = verifyInitData(req.get("X-Telegram-Init-Data") || "");
  if (!user) return res.status(401).json({ error: "Ilovani Telegram ichida oching." });
  req.tgUser = user;
  next();
}

const forApplicant = ({ internalNote: _i, tgId: _t, ...rest }: Application): MyApplication => rest;

app.get("/api/me", requireTelegram, (req: TgReq, res) => {
  const latest = db.latestForUser(req.tgUser!.id);
  res.json({ hiringOpen: db.isHiringOpen(), application: latest ? forApplicant(latest) : null });
});

app.post("/api/apply", requireTelegram, async (req: TgReq, res) => {
  const user = req.tgUser!;
  if (!db.isHiringOpen()) return res.status(409).json({ error: "Hozircha ariza qabul qilinmaydi." });

  const latest = db.latestForUser(user.id);
  if (latest && latest.status !== "rejected")
    return res.status(409).json({ error: "Sizda ko‘rib chiqilayotgan ariza bor." });

  const { ok, errors, value } = validateInput(req.body ?? {});
  if (!ok) return res.status(400).json({ error: "Maydonlarni tekshiring.", fields: errors });

  const created = db.createApplication(user.id, user.username ?? null, value);
  notifyManager(created); // fire and forget
  res.status(201).json({ application: forApplicant(created) });
});

/** Applicant confirms the interview or asks for another time. */
app.post("/api/interview/respond", requireTelegram, async (req: TgReq, res) => {
  const latest = db.latestForUser(req.tgUser!.id);
  if (!latest || latest.status !== "interview")
    return res.status(409).json({ error: "Sizda faol suhbat taklifi yo‘q." });

  const { response, note } = req.body ?? {};
  const text = typeof note === "string" ? note.trim().slice(0, LIMITS.responseNote) : "";
  if (response === "reschedule" && text.length < 3)
    return res.status(400).json({ error: "Qaysi kun va vaqt qulayligini yozing." });
  if (response !== "confirmed" && response !== "reschedule")
    return res.status(400).json({ error: "Noto‘g‘ri javob." });

  const updated = await recordResponse(latest, response, response === "reschedule" ? text : null);
  res.json({ application: forApplicant(updated) });
});

/* ───────────────────────────────── Manager panel ───────────────────────────────── */

app.post("/api/admin/login", loginLimiter, (req, res) => {
  if (!checkPassword(String(req.body?.password ?? ""))) return res.status(401).json({ error: "Parol noto‘g‘ri." });
  issueSession(res);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => res.json({ ok: isAdmin(req) }));

app.get("/api/admin/applications", requireAdmin, (req, res) => {
  const s = req.query.status as Status | undefined;
  const status = s && STATUSES.includes(s) ? s : undefined;
  res.json({
    applications: db.listApplications(status),
    counts: db.countByStatus(),
    rescheduleRequests: db.countRescheduleRequests(),
    hiringOpen: db.isHiringOpen(),
  });
});

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

app.post("/api/admin/applications/:id/decision", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const current = db.getApplication(id);
  if (!current) return res.status(404).json({ error: "Ariza topilmadi." });

  const { status, interviewAt, interviewPlace, managerNote } = req.body ?? {};
  const note = typeof managerNote === "string" ? managerNote.trim().slice(0, 500) : "";

  if (status === "interview") {
    if (typeof interviewAt !== "string" || !LOCAL_DT.test(interviewAt))
      return res.status(400).json({ error: "Suhbat sanasi va vaqtini tanlang." });
    const place = typeof interviewPlace === "string" ? interviewPlace.trim().slice(0, 200) : "";
    db.updateDecision(id, { status, interviewAt, interviewPlace: place || null, managerNote: note || null });
  } else if (status === "trial") {
    if (current.status !== "interview" && current.status !== "trial")
      return res.status(400).json({ error: "Sinov muddatiga faqat suhbatdan keyin qabul qilinadi." });
    const { trialStartAt } = req.body ?? {};
    if (typeof trialStartAt !== "string" || !LOCAL_DT.test(trialStartAt))
      return res.status(400).json({ error: "Birinchi ish kuni va vaqtini tanlang." });
    db.startTrial(id, trialStartAt, note || null);
  } else if (status === "rejected") {
    db.reject(id, note || null);
  } else if (status === "new") {
    db.updateDecision(id, { status }); // undo — no message is sent
    return res.json({ application: db.getApplication(id), delivered: null });
  } else {
    return res.status(400).json({ error: "Noto‘g‘ri holat." });
  }

  const updated = db.getApplication(id)!;
  const delivered = await notifyApplicant(updated);
  db.setNotified(id, delivered);
  res.json({ application: db.getApplication(id), delivered });
});

app.post("/api/admin/applications/:id/resend", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const current = db.getApplication(id);
  if (!current) return res.status(404).json({ error: "Ariza topilmadi." });
  if (current.status === "new") return res.status(400).json({ error: "Avval qaror qabul qiling." });
  const delivered = await notifyApplicant(current);
  db.setNotified(id, delivered);
  res.json({ application: db.getApplication(id), delivered });
});

app.post("/api/admin/applications/:id/note", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.getApplication(id)) return res.status(404).json({ error: "Ariza topilmadi." });
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
  res.json({ application: db.setInternalNote(id, note) });
});

app.post("/api/admin/settings", requireAdmin, (req, res) => {
  if (typeof req.body?.hiringOpen === "boolean") db.setSetting("hiring_open", req.body.hiringOpen ? "1" : "0");
  res.json({ hiringOpen: db.isHiringOpen() });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

/* ─────────────────────────────── Static front end ─────────────────────────────── */

const dist = path.resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => console.log(`ch-ish listening on :${config.port}`));

if (process.env.BOT_DISABLED !== "1") startBot().catch((e) => console.error("Bot failed to start:", e));
