# Baakio frontend

Phone-first React and TypeScript PWA for the Baakio owner ledger. It is a separate app from `../baakio-be` and calls the authenticated REST API directly.

## Local run

1. Start the backend using the instructions in `../baakio-be/README.md`.
2. Copy `.env.example` to `.env.local`.
3. Install packages with `npm install`.
4. Start Vite with `npm run dev` and open `http://127.0.0.1:5173`. Select Get Started or Log in to open `/app.html`.

`VITE_API_BASE_URL` is blank in the local example, so Vite proxies `/api` to `http://127.0.0.1:8080` and keeps the session and CSRF cookies same-origin. Set it to the backend origin only when a deployed frontend uses direct cross-origin requests; in that case, set the backend `FRONTEND_ORIGIN` to the exact browser origin.

The implemented screens use persisted English/Hindi language selection and the backend for customer search, statements, balances, reminders, and every financial write. Scan is shown as unavailable until the backend has a real private-storage and vision pipeline; the manual purchase flow remains ready.
