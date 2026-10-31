import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config";
import * as db from "./db";
import {
  handleWebhook,
  notifyApplicant,
  notifyManager,
  recordResponse,
  startBot,
  verifyInitData,
  WEBHOOK_PATH,
  type TgUser,
} from "./telegram";
import {
  clearSession,
  currentAdmin,
  ensureOwner,
  hashPassword,
  issueSession,
  loginLimiter,
  requireAdmin,
  requireOwner,
  resetLimiter,
  verifyPassword,
  type AdminReq,
} from "./auth";
import { DEFAULT_CONTENT, validateContent } from "../src/shared/hiring";
import { jobContentPdf } from "./pdf";
import { LIMITS, validateInput, type Application, type MyApplication, type PublicRound, type Round } from "../src/shared/types";

ensureOwner();

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

const publicRound = ({ id, name, content }: Round): PublicRound => ({ id, name, content });

app.get("/api/me", requireTelegram, (req: TgReq, res) => {
  const latest = db.latestForUser(req.tgUser!.id);
  const round = latest ? db.getRound(latest.roundId) : null;
  res.json({
    rounds: db.openRounds().map(publicRound), // open rounds the person can apply to
    application: latest ? forApplicant(latest) : null,
    applicationRound: round ? publicRound(round) : null,
  });
});

app.post("/api/apply", requireTelegram, async (req: TgReq, res) => {
  const user = req.tgUser!;
  const round = db.getRound(Number(req.body?.roundId));
  if (!round || !round.open) return res.status(409).json({ error: "Bu qabul yopilgan. Ilovani qayta oching." });

  const latest = db.latestForUser(user.id);
  if (latest && latest.status !== "rejected")
    return res.status(409).json({ error: "Sizda ko‘rib chiqilayotgan ariza bor." });

  const { ok, errors, value } = validateInput(req.body ?? {});
  if (!ok) return res.status(400).json({ error: "Maydonlarni tekshiring.", fields: errors });

  const created = db.createApplication(round.id, user.id, user.username ?? null, value);
  notifyManager(created, round); // fire and forget
  res.status(201).json({ application: forApplicant(created), applicationRound: publicRound(round) });
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
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const admin = username ? db.getAdminByUsername(username) : null;
  if (!admin || !admin.active || !verifyPassword(password, admin.passwordHash))
    return res.status(401).json({ error: "Login yoki parol noto‘g‘ri." });
  resetLimiter(req);
  db.touchLogin(admin.id);
  issueSession(res, admin);
  res.json({ admin: db.publicAdmin(admin) });
});

app.post("/api/admin/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const admin = currentAdmin(req);
  res.json({ admin: admin ? db.publicAdmin(admin) : null });
});

/* Rounds (Qabul) — every admin */

const storageWarning = () => (db.storage.persistent === false && config.isProd ? db.storage.path : null);

app.get("/api/admin/rounds", requireAdmin, (_req, res) => {
  res.json({ rounds: db.listRounds(), storageWarning: storageWarning() });
});

app.post("/api/admin/rounds", requireAdmin, (req: AdminReq, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Qabul nomini yozing." });
  const from = req.body?.copyFrom ? db.getRound(Number(req.body.copyFrom)) : null;
  const round = db.createRound({
    name,
    content: from ? from.content : DEFAULT_CONTENT,
    open: req.body?.open === true,
    createdBy: req.admin!.name,
  });
  res.status(201).json({ round });
});

app.get("/api/admin/rounds/:id", requireAdmin, (req, res) => {
  const round = db.getRound(Number(req.params.id));
  if (!round) return res.status(404).json({ error: "Qabul topilmadi." });
  res.json({
    round,
    applications: db.listApplications(round.id),
    counts: db.countByStatus(round.id),
    rescheduleRequests: db.countRescheduleRequests(round.id),
    storageWarning: storageWarning(),
  });
});

app.patch("/api/admin/rounds/:id", requireAdmin, (req, res) => {
  const round = db.getRound(Number(req.params.id));
  if (!round) return res.status(404).json({ error: "Qabul topilmadi." });
  const patch: { name?: string; open?: boolean } = {};
  if (typeof req.body?.name === "string") {
    const name = req.body.name.trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Qabul nomini yozing." });
    patch.name = name;
  }
  if (typeof req.body?.open === "boolean") patch.open = req.body.open;
  res.json({ round: db.updateRound(round.id, patch) });
});

app.delete("/api/admin/rounds/:id", requireAdmin, (req, res) => {
  const round = db.getRound(Number(req.params.id));
  if (!round) return res.status(404).json({ error: "Qabul topilmadi." });
  if (!db.deleteRound(round.id))
    return res.status(409).json({ error: "Arizalari bor qabulni o‘chirib bo‘lmaydi — uni yoping." });
  res.json({ ok: true });
});

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

app.post("/api/admin/applications/:id/decision", requireAdmin, async (req: AdminReq, res) => {
  const by = req.admin!.name;
  const id = Number(req.params.id);
  const current = db.getApplication(id);
  if (!current) return res.status(404).json({ error: "Ariza topilmadi." });

  const { status, interviewAt, interviewPlace, managerNote } = req.body ?? {};
  const note = typeof managerNote === "string" ? managerNote.trim().slice(0, 500) : "";

  if (status === "interview") {
    if (typeof interviewAt !== "string" || !LOCAL_DT.test(interviewAt))
      return res.status(400).json({ error: "Suhbat sanasi va vaqtini tanlang." });
    const place = typeof interviewPlace === "string" ? interviewPlace.trim().slice(0, 200) : "";
    db.updateDecision(id, { status, interviewAt, interviewPlace: place || null, managerNote: note || null }, by);
  } else if (status === "trial") {
    if (current.status !== "interview" && current.status !== "trial")
      return res.status(400).json({ error: "Sinov muddatiga faqat suhbatdan keyin qabul qilinadi." });
    const { trialStartAt } = req.body ?? {};
    if (typeof trialStartAt !== "string" || !LOCAL_DT.test(trialStartAt))
      return res.status(400).json({ error: "Birinchi ish kuni va vaqtini tanlang." });
    db.startTrial(id, trialStartAt, note || null, by);
  } else if (status === "rejected") {
    db.reject(id, note || null, by);
  } else if (status === "new") {
    db.updateDecision(id, { status }, by); // undo — no message is sent
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

/* Job content ("Ish shartlari") of a round — every admin */

app.put("/api/admin/rounds/:id/content", requireAdmin, (req: AdminReq, res) => {
  const round = db.getRound(Number(req.params.id));
  if (!round) return res.status(404).json({ error: "Qabul topilmadi." });
  const r = validateContent(req.body?.content);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ round: db.setRoundContent(round.id, r.value, req.admin!.name) });
});

/** PDF of a round's job post. Uses the posted (possibly unsaved) content so it matches the preview. */
app.post("/api/admin/rounds/:id/content/pdf", requireAdmin, async (req, res) => {
  const round = db.getRound(Number(req.params.id));
  if (!round) return res.status(404).json({ error: "Qabul topilmadi." });
  const r = validateContent(req.body?.content ?? round.content);
  if (!r.ok) return res.status(400).json({ error: r.error });
  try {
    const pdf = await jobContentPdf(r.value);
    const file = `ish-shartlari-${round.name}`.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${file}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error("PDF failed:", e);
    res.status(500).json({ error: "PDF yaratib bo‘lmadi." });
  }
});

/* Admin accounts — main admin only */

const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const MIN_PASSWORD = 8;

app.get("/api/admin/admins", requireAdmin, requireOwner, (_req, res) => {
  res.json({ admins: db.listAdmins().map(db.publicAdmin) });
});

app.post("/api/admin/admins", requireAdmin, requireOwner, (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 60);
  const username = String(req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!name) return res.status(400).json({ error: "Ismini yozing." });
  if (!USERNAME.test(username))
    return res.status(400).json({ error: "Login 3–32 belgi: lotin harflari, raqamlar, nuqta, _ yoki -." });
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Parol kamida ${MIN_PASSWORD} belgi bo‘lsin.` });
  if (db.getAdminByUsername(username)) return res.status(409).json({ error: "Bu login band." });
  const admin = db.createAdmin({ name, username, passwordHash: hashPassword(password), role: "hr" });
  res.status(201).json({ admin: db.publicAdmin(admin) });
});

app.patch("/api/admin/admins/:id", requireAdmin, requireOwner, (req, res) => {
  const target = db.getAdmin(Number(req.params.id));
  if (!target) return res.status(404).json({ error: "Admin topilmadi." });
  if (target.role === "owner")
    return res.status(400).json({ error: "Bosh admin parolini Coolify’dagi ADMIN_PASSWORD orqali o‘zgartiring." });

  const patch: { name?: string; passwordHash?: string; active?: boolean } = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim().slice(0, 60);
  if (typeof req.body?.active === "boolean") patch.active = req.body.active;
  if (typeof req.body?.password === "string") {
    if (req.body.password.length < MIN_PASSWORD)
      return res.status(400).json({ error: `Parol kamida ${MIN_PASSWORD} belgi bo‘lsin.` });
    patch.passwordHash = hashPassword(req.body.password);
  }
  res.json({ admin: db.publicAdmin(db.updateAdmin(target.id, patch)!) });
});

app.delete("/api/admin/admins/:id", requireAdmin, requireOwner, (req, res) => {
  const target = db.getAdmin(Number(req.params.id));
  if (!target) return res.status(404).json({ error: "Admin topilmadi." });
  if (target.role === "owner") return res.status(400).json({ error: "Bosh adminni o‘chirib bo‘lmaydi." });
  db.deleteAdmin(target.id);
  res.json({ ok: true });
});

app.post(WEBHOOK_PATH, handleWebhook);
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

// Last line of defence: log, don't die — the API and manager panel must stay up.
process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e));
