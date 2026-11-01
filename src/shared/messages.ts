import { formatInterview } from "./format";

/**
 * Default texts of the bot messages a candidate receives. The admin sees this text in the
 * decision form ("Nomzod ko‘radigan xabar"), may edit it, and exactly that text is sent.
 * Plain text — no formatting markup.
 */
export const MESSAGE_LIMIT = 3000;

const first = (fullName: string) => fullName.trim().split(/\s+/)[0] || "";

export function interviewMessage(o: { fullName: string; interviewAt: string; place: string }) {
  return (
    `Assalomu alaykum, ${first(o.fullName)}! 🎉\n\n` +
    `Arizangiz ko‘rib chiqildi — sizni suhbatga taklif qilamiz.\n\n` +
    `🗓 Vaqt: ${formatInterview(o.interviewAt)}\n` +
    `📍 Manzil: ${o.place}\n\n` +
    `Kela olasizmi? Quyidagi tugma orqali javob bering.`
  );
}

export function trialMessage(o: { fullName: string; trialStartAt: string; branch: string }) {
  return (
    `Tabriklaymiz, ${first(o.fullName)}! 🎉☕️\n\n` +
    `Suhbatdan muvaffaqiyatli o‘tdingiz — sizni 30 kunlik sinov muddatiga qabul qilamiz.\n\n` +
    `🗓 Birinchi ish kuni: ${formatInterview(o.trialStartAt)}\n` +
    `📍 Filial: ${o.branch}\n\n` +
    `Sinov muddatida ham oylik to‘lanadi. Ishni yaxshi o‘rgansangiz, doimiy ishga olinasiz. Omad!`
  );
}

export function rejectMessage(o: { fullName: string; duringTrial: boolean }) {
  return o.duringTrial
    ? `Assalomu alaykum, ${first(o.fullName)}.\n\n` +
        `Sinov muddatida ishlaganingiz uchun rahmat. Afsuski, natijalarga ko‘ra hamkorlikni davom ettira olmaymiz.\n\n` +
        `Ishlagan kunlaringiz uchun oylik kelishilganidek to‘lanadi. Omad!`
    : `Assalomu alaykum, ${first(o.fullName)}.\n\n` +
        `Coffee House’ga qiziqish bildirganingiz uchun rahmat. Afsuski, bu safar boshqa nomzodni tanladik.\n\n` +
        `Yangi o‘rin ochilganda shu bot orqali yana ariza topshirishingiz mumkin. Omad!`;
}
