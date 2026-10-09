# Piring Kita

Two-member household meal planning for a trusted local network.

## Development

AI meal recommendations and ingredient nutrition lookup are optional. Set
`OPENROUTER_API_KEY` for recommendations and translated ingredient aliases,
`OPENROUTER_MEAL_MODEL` and `OPENROUTER_ALIAS_MODEL` for their respective
OpenRouter model IDs, and `USDA_API_KEY` for verified nutrition lookup. The backend reads these
environment variables; keys are never stored in the app database or sent to
the browser. For local development, put them in an ignored `.env` file and
export them in the shell used to start Bun. Docker Compose reads the same
variables from `.env` automatically. Without the keys, the corresponding
buttons report that the service is unavailable while the rest of the app
continues to work.

AI provider prompts and responses are printed in the `bun run dev` terminal by
default, without API keys or authorization headers. Set `AI_DEBUG_LOG=false` to
disable them. Production and Docker logging is off unless `AI_DEBUG_LOG=true`
is set explicitly; logged prompts can contain meal and nutrition data. Meal
model defaults are documented in `.env.example`.

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

## Raspberry Pi 3 production

Use a 64-bit Raspberry Pi OS installation. Bun and the `oven/bun` image support
Linux ARM64; the Pi 3's limited memory also makes a 64-bit Lite image preferable.

### Docker (recommended)

Install Docker Engine and the Compose plugin using Docker's
[Raspberry Pi OS instructions](https://docs.docker.com/engine/install/raspberry-pi-os/),
then clone this repository on the Pi and run:

```bash
cd menu-and-nutrition-helper
sudo systemctl enable --now docker
sudo docker compose up --build -d
sudo docker compose logs -f piring-kita
```

Open `http://<raspberry-pi-address>:3000`. SQLite data is stored in the
`piring-kita-data` volume. The Compose file uses `restart: unless-stopped`, so
Docker starts the app again after a reboot unless you explicitly stopped it.

Update the deployment with:

```bash
git pull
sudo docker compose up --build -d
```

### Build and run directly

Install Bun, build both workspaces, and start the production server:

```bash
sudo apt update
sudo apt install -y curl unzip
curl -fsSL https://bun.com/install | bash
source "$HOME/.bashrc"
cd menu-and-nutrition-helper
bun install --frozen-lockfile
bun run build
mkdir -p app/backend/data
PORT=3000 DB_PATH="$PWD/app/backend/data/piring-kita.sqlite" bun --cwd app/backend start
```

To run the direct build automatically at boot, replace `pi` and the two
`/home/pi/...` paths below with the output of `whoami` and the absolute path to
your checkout, then create `/etc/systemd/system/piring-kita.service`:

```ini
[Unit]
Description=Piring Kita meal planner
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/menu-and-nutrition-helper
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DB_PATH=/home/pi/menu-and-nutrition-helper/app/backend/data/piring-kita.sqlite
ExecStart=/home/pi/.bun/bin/bun run --cwd app/backend start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable it and inspect its logs:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now piring-kita
sudo systemctl status piring-kita
journalctl -u piring-kita -f
```

JSON backup, JSON restore, and raw SQLite download are available from the
application API for both deployment methods.

The original dependency-free prototype remains under `.scratch/meal-planning-app/prototypes/dashboard-prototype/` as a reference.
