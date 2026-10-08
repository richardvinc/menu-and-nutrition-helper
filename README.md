# Piring Kita

Two-member household meal planning for a trusted local network.

## Development

Install dependencies:

```powershell
bun install
```

Start the API and frontend together—Docker is not required:

```powershell
bun run dev
```

Open `http://localhost:5173`. The API runs on port `3001`, Vite proxies `/api` to it, and local data is saved to `app/backend/data/piring-kita.sqlite`.

Press `Ctrl+C` once to stop both processes. The separate `dev:backend` and `dev:frontend` commands remain available when debugging either side alone.

## Checks

```powershell
bun run test
bun run build
bun run test:e2e
```

## Raspberry Pi / Docker

```powershell
docker compose up --build -d
```

Open `http://<raspberry-pi-address>:3000`. SQLite data is stored in the `piring-kita-data` volume. JSON backup, JSON restore, and raw SQLite download are available from the application API.

The original dependency-free prototype remains under `.scratch/meal-planning-app/prototypes/dashboard-prototype/` as a reference.
