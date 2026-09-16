# IntelMind — React + Express Edition

Same app as before (products, services, sales with VAT-per-item, printable
and downloadable receipts, service records, debts, profit & loss, staff
logins), rebuilt with a React frontend talking to an Express JSON API.

## Project structure

```
intelmind-react/
├── server/          Express API + SQLite database
│   ├── server.js      All /api/* routes
│   ├── db.js           Schema + auto-migrations
│   ├── data/            stock.db lives here (auto-created)
│   └── .env.example
└── client/          React app (Vite)
    └── src/
        ├── pages/          One file per screen
        ├── components/     Layout (sidebar/topbar), Pagination, ConfirmModal, etc.
        ├── context/         AuthContext (session-based login state)
        └── api/client.js    fetch wrapper
```

## Running it locally (development)

You need [Node.js](https://nodejs.org) installed.

**1. Start the API server:**
```
cd server
cp .env.example .env      # then edit ADMIN_USER / ADMIN_PASSWORD
npm install
npm run dev                # or npm start
```
Runs on `http://localhost:3000`.

**2. In a second terminal, start the React app:**
```
cd client
npm install
npm run dev
```
Runs on `http://localhost:5173` and proxies `/api` calls to the server
above. Open that URL in your browser and log in.

You need **both** terminals running at the same time during development.

## Running it as one app (production-style)

This is the simpler way to actually deploy or hand off the app — one
server, one URL, no separate dev servers:

```
cd client
npm install
npm run build          # creates client/dist

cd ../server
npm install
npm start
```

Now open `http://localhost:3000` — the Express server serves the built
React app directly, so there's only one process to run and one port to
open. Whenever you change the React code, re-run `npm run build` in
`client/` and restart the server.

## What's the same as before

- SQLite database (`server/data/stock.db`), same schema, same auto-migration
  behavior — if you already have a `stock.db` from the EJS version, copy it
  into `server/data/` and it'll pick up right where you left off.
- Admin login via `.env`, staff logins created in-app.
- VAT set per product/service, PDF receipt downloads, the 10-second delete
  confirmation, Debts, Service Records, Profit & Loss — all carried over.

## What's different

- The frontend is now a single-page React app instead of server-rendered
  pages — navigation feels instant since it doesn't reload the whole page.
- The server only serves data (JSON) and the receipt PDF; all the page
  layout and interactivity now lives in `client/src`.
- Deploying now means building the client first, then running the server —
  see "Running it as one app" above.

## A note on security

Same as before: staff passwords are hashed, but this is meant for trusted
local/small-business use. Putting it on the open internet needs a few
extra steps (HTTPS, a strong `SESSION_SECRET`) — ask if you get there.
