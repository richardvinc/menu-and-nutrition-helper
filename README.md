# Piring Kita

Two-member household meal planning for a trusted local network.

## Development

Install dependencies:

```powershell
bun install
```

Run the API and frontend in separate PowerShell windows:

```powershell
bun run dev:backend
bun run dev:frontend
```

Open `http://localhost:5173`.

## Checks

```powershell
bun run test
bun run build
```

## Raspberry Pi / Docker

```powershell
docker compose up --build -d
```

Open `http://<raspberry-pi-address>:3000`. SQLite data is stored in the `piring-kita-data` volume. JSON backup, JSON restore, and raw SQLite download are available from the application API.

The original dependency-free prototype remains under `.scratch/meal-planning-app/prototypes/dashboard-prototype/` as a reference.
