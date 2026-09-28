# Remote Anything web client

Phone-first client for the Remote Anything server: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui.

```sh
npm install
npm run build     # outputs web/dist, served by server/sync-server.mjs
npm run dev       # dev server; proxies /api to 127.0.0.1:8811
npm run lint      # oxlint
```

Run the server (`node server/sync-server.mjs --port 8811`) from the repository root while developing.
Design notes live in [DESIGN.md](DESIGN.md).
