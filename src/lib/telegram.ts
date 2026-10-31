/* Minimal typing for the parts of Telegram.WebApp this app uses. */
interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string; username?: string; allows_write_to_pm?: boolean } };
  version: string;
  ready(): void;
  expand(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  isVersionAtLeast(v: string): boolean;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void; impactOccurred(s: "light" | "medium"): void };
  requestContact?(cb: (sent: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void): void;
  requestWriteAccess?(cb: (granted: boolean) => void): void;
  close(): void;
}

declare global {
  interface Window { Telegram?: { WebApp?: WebApp } }
}

export const tg: WebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#71292A");
    tg.setBackgroundColor("#FBF7F3");
  } catch {
    /* older clients */
  }
}

export const haptic = (t: "success" | "error" | "warning") => tg?.HapticFeedback?.notificationOccurred(t);

/** Ask Telegram for the user's phone number. Resolves to the number or null. */
export function requestPhone(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!tg?.requestContact || !tg.isVersionAtLeast("6.9")) return resolve(null);
    tg.requestContact((sent, res) => {
      const p = res?.responseUnsafe?.contact?.phone_number;
      resolve(sent && p ? (p.startsWith("+") ? p : `+${p}`) : null);
    });
  });
}

/** Make sure the bot may message the user (needed for the decision message). */
export function ensureWriteAccess(): Promise<void> {
  return new Promise((resolve) => {
    const u = tg?.initDataUnsafe.user;
    if (!tg?.requestWriteAccess || u?.allows_write_to_pm || !tg.isVersionAtLeast("6.9")) return resolve();
    tg.requestWriteAccess(() => resolve());
  });
}
