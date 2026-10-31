const req = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k} — see .env.example`);
  return v;
};

export const config = {
  port: Number(process.env.PORT || 3000),
  botToken: req("BOT_TOKEN"),
  /** Public HTTPS URL of this app, e.g. https://ish.coffeehouseangren.uz */
  publicUrl: req("PUBLIC_URL").replace(/\/$/, ""),
  adminPassword: req("ADMIN_PASSWORD"),
  sessionSecret: req("SESSION_SECRET"),
  /** Telegram chat that gets a ping for each new application (optional). */
  managerChatId: process.env.MANAGER_CHAT_ID || "",
  dbPath: process.env.DB_PATH || "./data/ish.db",
  isProd: process.env.NODE_ENV === "production",
};
