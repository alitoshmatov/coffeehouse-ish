# ch-ish — Coffee House barista hiring

A Telegram mini app where candidates apply for the barista job, plus a web
panel where managers review applications and either invite to an interview
or reject. The bot messages the candidate automatically either way.

```
Candidate                         Manager (PUBLIC_URL/admin, password)
─────────                         ───────────────────────────────────
/start in the bot ─► mini app     sees new application (+ optional group ping)
reads terms, fills the form  ───► Yangi
                                  ├─ Suhbatga taklif: date, time, place, note
sees status in the mini app  ◄──  │    → bot sends the invitation
  + gets a bot message            └─ Rad etish: optional note
                                       → bot sends a polite rejection
```

One Node process serves everything: the API, the static front end and the bot
(long polling). Data lives in a single SQLite file.

## Stack

- **Front end:** React + Vite + Tailwind (brand colours of coffeehouseangren.uz)
- **Server:** Express, `node:sqlite` (built into Node 22 — no native build), grammY
- **Auth:** candidates via signed Telegram `initData`; managers via password + signed cookie

## 1. Create the bot

1. In Telegram open **@BotFather** → `/newbot` → e.g. `CoffeeHouseIshBot`. Copy the token.
2. `/setdescription` — e.g. "Coffee House’da barista bo‘lib ishlash uchun ariza topshiring."
3. Nothing else is needed — on start the app sets the bot’s menu button and `/start` reply itself.

## 2. Run locally

```bash
cp .env.example .env      # fill BOT_TOKEN, ADMIN_PASSWORD, SESSION_SECRET
npm install
npm run dev               # web on :5173 (proxies /api), API + bot on :3000
```

The candidate side only works inside Telegram (it needs signed `initData`).
To try it on your phone, expose the dev server over HTTPS (e.g. `ngrok http 5173`),
put that URL in `PUBLIC_URL`, restart, and open the bot.
The manager panel works in any browser: http://localhost:5173/admin

## 3. Deploy on Coolify

1. Push this folder to a Git repo and add it in Coolify as a **Dockerfile** app.
2. Domain: e.g. `ish.coffeehouseangren.uz` (HTTPS is required by Telegram). Port **3000**.
3. **Persistent storage:** mount a volume at **`/data`** — otherwise applications are lost on redeploy.
4. Environment variables: everything from `.env.example` (`DB_PATH` can stay at the default `/data/ish.db`).
5. Deploy. The log should show `Bot @YourBot started`.

Run only **one** instance — two instances would both poll the bot.

## Everyday use

- **Open/close hiring:** the "Qabul ochiq / yopiq" switch in the panel header. When closed, the mini app shows a "closed" screen and new applications are refused.
- **Change the job text** (salary, hours, terms): `src/shared/hiring.ts`, then redeploy.
  Keep it in sync with `ch-landing/src/pages/barista-hiring/data.ts`.
- **"Xabar yetib bormagan"**: the candidate blocked the bot or never pressed Start. Use "Qayta yuborish" or call them.
- **Backup:** copy `/data/ish.db` (SQLite).

## API

| Method | Path | Who |
|---|---|---|
| GET | `/api/me` | candidate — own latest application + whether hiring is open |
| POST | `/api/apply` | candidate — submit (one active application per Telegram account) |
| POST | `/api/admin/login` / `logout`, GET `/api/admin/session` | manager |
| GET | `/api/admin/applications` | manager — all applications + counts |
| POST | `/api/admin/applications/:id/decision` | manager — `{status: "interview", interviewAt: "2026-11-03T10:00", interviewPlace?, managerNote?}` / `{status: "rejected", managerNote?}` / `{status: "new"}` (undo, no message) |
| POST | `/api/admin/applications/:id/resend` | manager — resend the decision message |
| POST | `/api/admin/applications/:id/note` | manager — internal note (never shown to candidate) |
| POST | `/api/admin/settings` | manager — `{hiringOpen: boolean}` |

Times are Tashkent wall-clock time (UTC+5).
