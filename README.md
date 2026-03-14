# Odoo Activities GSD

> Manage your planned activities in Odoo with a smooth, mobile-first UI.

A Progressive Web App (PWA) that surfaces your Odoo activities as a swipeable card stack — so you can process them quickly without ever opening the Odoo backend.

---

## Features

- **Swipe left** — mark the activity as done
- **Swipe far left** — mark as done *and* automatically schedule the next chained activity (uses the activity type's `triggered_next_type_id` in Odoo, falls back to the same type)
- **Swipe right** — snooze: moves overdue/today activities to the next business day; future activities are simply dismissed from the view without touching the deadline
- **Voice notes** — tap the mic to record a note; it is appended to the activity in Odoo via a chatter message
- **Human-readable deadlines** — "Yesterday", "Tomorrow", "Next Monday", "3 weeks ago", colour-coded red (past), yellow (today), neutral (future)
- **PWA / installable** — works offline-first, installable on iOS and Android home screens
- **No server needed** — all credentials are stored in `localStorage`; nothing is sent to any third party

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

On first load you will be asked for:

| Field | Example |
|---|---|
| Odoo URL | `https://mycompany.odoo.com` |
| Database | `mycompany` |
| Username | `user@example.com` |
| API key | generate one in *Settings → Technical → API Keys* |

Credentials are saved to `localStorage` and never leave your browser.

### CORS during local development

The Vite dev server proxies all `/jsonrpc` and `/xmlrpc` requests to your Odoo instance, so you will **not** hit CORS issues locally. The target URL is taken from the `X-Odoo-Target` header that the app sends automatically.

---

## Deploying to Vercel

```bash
npm run build
vercel deploy --prod
```

Or connect the repository to Vercel — it will detect the Vite project automatically. The `vercel.json` file already contains the SPA rewrite rule:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

### CORS in production

In production the browser calls your Odoo server directly (no proxy). Your Odoo instance must allow cross-origin requests from your Vercel domain.

Add the following to your Odoo `odoo.conf`:

```ini
cors = https://your-app.vercel.app
```

Or configure it via a reverse proxy (nginx/Caddy) with the appropriate `Access-Control-Allow-Origin` header.

---

## Environment variables

No environment variables are required. The app stores all settings in the browser's `localStorage` at runtime.

If you want to pre-fill defaults during development you can create a `.env` file (it is git-ignored):

```env
# .env  — never commit this file
VITE_ODOO_URL=https://your-odoo.example.com
VITE_ODOO_DB=your_database
VITE_ODOO_USERNAME=user@example.com
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Icons | Lucide React |
| PWA | vite-plugin-pwa |
| API | Odoo JSON-RPC |

---

## Project structure

```
src/
  components/
    CardStack.tsx   # main swipeable card UI
    Setup.tsx       # first-run connection form
  lib/
    odoo.ts         # Odoo JSON-RPC helpers
  App.tsx
  main.tsx
public/
  icon.svg          # PWA icon (GET SHIT DONE)
  apple-touch-icon.png
vercel.json
```

---

## License

MIT
