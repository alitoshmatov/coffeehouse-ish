import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { Bot, InlineKeyboard } from "grammy";
import { config } from "./config";
import { branchLine } from "../src/shared/hiring";
import { formatInterview } from "../src/shared/format";
import type { Application, InterviewResponse } from "../src/shared/types";
import * as db from "./db";

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

/**
 * Verify Telegram.WebApp.initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the user when the signature is valid and fresh, otherwise null.
 */
export function verifyInitData(initData: string, maxAgeSec = 24 * 3600): TgUser | null {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get("user") || "null") as TgUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export const bot = new Bot(config.botToken);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const appButton = (text: string) => new InlineKeyboard().webApp(text, `${config.publicUrl}/`);

bot.command("start", (ctx) =>
  ctx.reply(
    `Assalomu alaykum! ☕️\n\n<b>${esc(db.getContent().branchName)}</b> filialiga barista qidiryapmiz.\n` +
      `Shartlar bilan tanishib, ariza yuboring — natijani shu yerda xabar qilamiz.`,
    { parse_mode: "HTML", reply_markup: appButton("📝 Ariza topshirish") },
  ),
);

/* Interview reply buttons. callback_data = "iv:ok:<id>:<yyyymmddhhmm>" — the time stamp makes
   buttons on an old invitation stop working once the manager picks a new time. */
const stamp = (local: string | null) => (local ?? "").replace(/\D/g, "");

bot.callbackQuery(/^iv:ok:(\d+):(\d*)$/, async (ctx) => {
  const [, id, ts] = ctx.match;
  const a = db.getApplication(Number(id));
  if (!a || a.tgId !== ctx.from.id) return ctx.answerCallbackQuery({ text: "Ariza topilmadi." });
  if (a.status !== "interview" || stamp(a.interviewAt) !== ts)
    return ctx.answerCallbackQuery({ text: "Bu taklif eskirgan — ilovada hozirgi holatni ko‘ring.", show_alert: true });

  await recordResponse(a, "confirmed", null);
  await ctx.answerCallbackQuery({ text: "Rahmat! Sizni kutamiz ☕️" });
  await ctx
    .editMessageReplyMarkup({ reply_markup: responseKeyboard(a, true) })
    .catch(() => {}); // message too old to edit — not important
  await ctx.reply("✅ Kelishingizni tasdiqladingiz. Vaqt o‘zgarsa, ilovadan boshqa vaqt so‘rashingiz mumkin.");
});

function responseKeyboard(a: Application, confirmed = false) {
  const kb = new InlineKeyboard();
  if (!confirmed) kb.text("✅ Kelaman", `iv:ok:${a.id}:${stamp(a.interviewAt)}`).row();
  return kb.webApp("🕒 Boshqa vaqt so‘rash", `${config.publicUrl}/?reschedule=1`);
}

/** Save the applicant's answer and let the managers know. */
export async function recordResponse(a: Application, response: InterviewResponse, note: string | null) {
  const updated = db.setInterviewResponse(a.id, response, note);
  if (!config.managerChatId) return updated;
  const text =
    response === "confirmed"
      ? `✅ <b>${esc(a.fullName)}</b> suhbatga kelishini tasdiqladi` +
        (a.interviewAt ? ` (${esc(formatInterview(a.interviewAt))})` : "")
      : `🕒 <b>${esc(a.fullName)}</b> suhbat vaqtini o‘zgartirishni so‘radi` +
        (note ? `:\n“${esc(note)}”` : "");
  try {
    await bot.api.sendMessage(config.managerChatId, text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("Arizani ochish", `${config.publicUrl}/admin#${a.id}`),
    });
  } catch (e) {
    console.error("Could not notify manager chat:", (e as Error).message);
  }
  return updated;
}

bot.on("message", (ctx) =>
  ctx.reply("Ariza topshirish yoki holatini ko‘rish uchun tugmani bosing.", {
    reply_markup: appButton("Ilovani ochish"),
  }),
);

bot.catch((err) => console.error("Bot error:", err.error));

/** Start long polling and point the chat menu button at the mini app. */
/*
 * Production (https PUBLIC_URL): webhook. Telegram pushes updates to /api/telegram/webhook,
 * so during a rolling deploy the old and new containers never fight over getUpdates.
 * Local dev (http PUBLIC_URL) or BOT_MODE=polling: long polling.
 * Bot problems are logged and retried — they must never take the web server down.
 */
export const useWebhook = config.publicUrl.startsWith("https://") && process.env.BOT_MODE !== "polling";
export const WEBHOOK_PATH = "/api/telegram/webhook";
const webhookSecret = createHash("sha256").update(`webhook:${config.botToken}`).digest("hex").slice(0, 48);
let botReady = false;

/** Express handler for Telegram webhook updates. */
export async function handleWebhook(req: Request, res: Response) {
  if (req.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge at once so Telegram never re-sends
  try {
    if (!botReady) {
      await bot.init();
      botReady = true;
    }
    await bot.handleUpdate(req.body);
  } catch (e) {
    console.error("Bot update failed:", (e as Error).message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startBot() {
  // Setup calls: retry until Telegram answers (e.g. network hiccup at boot)
  for (let attempt = 1; ; attempt++) {
    try {
      await bot.init();
      botReady = true;
      await bot.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Ariza", web_app: { url: `${config.publicUrl}/` } },
      });
      await bot.api.setMyCommands([{ command: "start", description: "Ariza topshirish" }]);
      if (useWebhook) {
        await bot.api.setWebhook(`${config.publicUrl}${WEBHOOK_PATH}`, {
          secret_token: webhookSecret,
          allowed_updates: ["message", "callback_query"],
        });
        console.log(`Bot @${bot.botInfo.username} ready (webhook)`);
        return;
      }
      break;
    } catch (e) {
      console.error(`Bot setup failed (attempt ${attempt}):`, (e as Error).message);
      await sleep(Math.min(60_000, attempt * 5_000));
    }
  }

  // Long polling. A 409 means another instance is polling with the same token —
  // keep retrying instead of crashing; it resolves when the other one stops.
  for (;;) {
    try {
      await bot.start({
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query"],
        onStart: (me) => console.log(`Bot @${me.username} ready (polling)`),
      });
      return; // bot.stop() was called
    } catch (e) {
      console.error("Polling stopped:", (e as Error).message, "— retrying in 15s");
      await sleep(15_000);
    }
  }
}

/** Message sent to the applicant when the manager decides. Returns true if delivered. */
export async function notifyApplicant(a: Application): Promise<boolean> {
  const first = esc(a.fullName.split(/\s+/)[0]);
  let text: string;
  if (a.status === "interview") {
    text =
      `Assalomu alaykum, ${first}! 🎉\n\n` +
      `Arizangiz ko‘rib chiqildi — sizni <b>suhbatga</b> taklif qilamiz.\n\n` +
      (a.interviewAt ? `🗓 <b>Vaqt:</b> ${esc(formatInterview(a.interviewAt))}\n` : "") +
      `📍 <b>Manzil:</b> ${esc(a.interviewPlace || branchLine(db.getContent()))}\n` +
      (a.managerNote ? `\n${esc(a.managerNote)}\n` : "") +
      `\nKela olasizmi? Quyidagi tugma orqali javob bering.`;
  } else if (a.status === "trial") {
    text =
      `Tabriklaymiz, ${first}! 🎉☕️\n\n` +
      `Suhbatdan muvaffaqiyatli o‘tdingiz — sizni <b>30 kunlik sinov muddatiga</b> qabul qilamiz.\n\n` +
      (a.trialStartAt ? `🗓 <b>Birinchi ish kuni:</b> ${esc(formatInterview(a.trialStartAt))}\n` : "") +
      `📍 <b>Filial:</b> ${esc(branchLine(db.getContent()))}\n` +
      (a.managerNote ? `\n${esc(a.managerNote)}\n` : "") +
      `\nSinov muddatida ham oylik to‘lanadi. Ishni yaxshi o‘rgansangiz, doimiy ishga olinasiz. Omad!`;
  } else if (a.status === "rejected" && a.trialStartAt) {
    text =
      `Assalomu alaykum, ${first}.\n\n` +
      `Sinov muddatida ishlaganingiz uchun rahmat. Afsuski, natijalarga ko‘ra hamkorlikni davom ettira olmaymiz.` +
      (a.managerNote ? `\n\n${esc(a.managerNote)}` : "") +
      `\n\nIshlagan kunlaringiz uchun oylik kelishilganidek to‘lanadi. Omad!`;
  } else if (a.status === "rejected") {
    text =
      `Assalomu alaykum, ${first}.\n\n` +
      `Coffee House’ga qiziqish bildirganingiz uchun rahmat. Afsuski, bu safar boshqa nomzodni tanladik.` +
      (a.managerNote ? `\n\n${esc(a.managerNote)}` : "") +
      `\n\nYangi o‘rin ochilganda shu bot orqali yana ariza topshirishingiz mumkin. Omad!`;
  } else return false;

  try {
    await bot.api.sendMessage(a.tgId, text, {
      parse_mode: "HTML",
      reply_markup: a.status === "interview" ? responseKeyboard(a) : undefined,
    });
    return true;
  } catch (e) {
    console.error(`Could not message applicant #${a.id}:`, (e as Error).message);
    return false;
  }
}

/** Ping the manager chat about a new application (optional). */
export async function notifyManager(a: Application) {
  if (!config.managerChatId) return;
  const text =
    `🆕 <b>Yangi ariza #${a.id}</b>\n\n` +
    `👤 ${esc(a.fullName)}, ${a.age} yosh\n📞 ${esc(a.phone)}` +
    (a.tgUsername ? `\n✈️ @${esc(a.tgUsername)}` : "");
  try {
    await bot.api.sendMessage(config.managerChatId, text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("Arizani ochish", `${config.publicUrl}/admin#${a.id}`),
    });
  } catch (e) {
    console.error("Could not notify manager chat:", (e as Error).message);
  }
}
