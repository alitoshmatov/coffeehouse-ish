import { createHmac, timingSafeEqual } from "node:crypto";
import { Bot, InlineKeyboard } from "grammy";
import { config } from "./config";
import { BRANCH_ADDRESS, BRANCH_NAME } from "../src/shared/hiring";
import { formatInterview } from "../src/shared/format";
import type { Application } from "../src/shared/types";

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
    `Assalomu alaykum! ☕️\n\n<b>${BRANCH_NAME}</b> yangi filialiga barista qidiryapmiz.\n` +
      `Shartlar bilan tanishib, ariza yuboring — natijani shu yerda xabar qilamiz.`,
    { parse_mode: "HTML", reply_markup: appButton("📝 Ariza topshirish") },
  ),
);

bot.on("message", (ctx) =>
  ctx.reply("Ariza topshirish yoki holatini ko‘rish uchun tugmani bosing.", {
    reply_markup: appButton("Ilovani ochish"),
  }),
);

bot.catch((err) => console.error("Bot error:", err.error));

/** Start long polling and point the chat menu button at the mini app. */
export async function startBot() {
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Ariza", web_app: { url: `${config.publicUrl}/` } },
  });
  await bot.api.setMyCommands([{ command: "start", description: "Ariza topshirish" }]);
  bot.start({ drop_pending_updates: true, onStart: (me) => console.log(`Bot @${me.username} started`) });
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
      `📍 <b>Manzil:</b> ${esc(a.interviewPlace || `${BRANCH_NAME}, ${BRANCH_ADDRESS}`)}\n` +
      (a.managerNote ? `\n${esc(a.managerNote)}\n` : "") +
      `\nKela olmasangiz, iltimos, shu yerga oldindan yozib qo‘ying.`;
  } else if (a.status === "rejected") {
    text =
      `Assalomu alaykum, ${first}.\n\n` +
      `Coffee House’ga qiziqish bildirganingiz uchun rahmat. Afsuski, bu safar boshqa nomzodni tanladik.` +
      (a.managerNote ? `\n\n${esc(a.managerNote)}` : "") +
      `\n\nYangi o‘rin ochilganda shu bot orqali yana ariza topshirishingiz mumkin. Omad!`;
  } else return false;

  try {
    await bot.api.sendMessage(a.tgId, text, { parse_mode: "HTML" });
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
