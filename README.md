# Lab 3 — Campus Shop

Telegram shopping bot (Python), back-end business logic (Node.js + SQLite), and Telegram Mini App. Implements the advanced task in the supplied Lab 3 description.

## Requirements

Node.js 24+ and Python 3.12+. Runtime code uses only standard libraries; no package installation is required. SQLite support is built into Node.js. The bundled original sticker needs no image library at runtime.

## Local demo

```sh
cd /workspace/lab3/backend
DEMO_MODE=1 node server.js
```

Open port 3000 locally. Demo mode assigns requests to a fixed test user; **never enable it on a public deployment**. SQLite is stored in `backend/data/shop.sqlite`. Demo purchases persist. Use `DB_PATH=/tmp/lab3-demo.sqlite` for a separate demo database.

## Telegram setup

1. In Telegram, open the official `@BotFather`, run `/newbot`, choose a name and a unique username ending in `bot`, and obtain the token. Never include it in the report or Git.
2. Copy `.env.example` to `.env`. Set `TELEGRAM_BOT_TOKEN` and a strong random `BACKEND_API_KEY` (for example, generate one with `python -c 'import secrets; print(secrets.token_hex(32))'`). The bot and backend must share these values.
3. Deploy the backend through an HTTPS reverse proxy or a trusted HTTPS development tunnel. Set `WEB_APP_URL` to its public HTTPS root. The proxy must forward the `X-Telegram-Init-Data` header. Keep the backend bound to loopback when the reverse proxy runs on the same host; set `HOST=0.0.0.0` only when required by the hosting platform. Restrict access and protect the API key.
4. From the repository root, load variables in each terminal and start the backend and bot:

```sh
set -a
. ./.env
set +a
# Terminal 1 (DEMO_MODE must be unset for real Telegram use):
cd backend
node server.js
# Terminal 2, after loading .env from repository root:
python bot/main.py
```

5. Open the bot in a private chat and send `/start`. Verify the sticker, Catalog, confirmation, My orders, and Open Mini App. The Mini App keyboard is only offered in private chats. A menu button is optional; set it through BotFather if desired.

The bot uses long polling and removes an existing webhook when started. Run only one bot instance per token. Telegram traffic requires `api.telegram.org`; loading Telegram's Mini App SDK requires `telegram.org`. The Mini App must be accessed inside Telegram for authenticated real orders; an ordinary browser is only usable with local demo mode.

## Validation

```sh
cd backend && npm test
cd ../bot && python -m unittest -v
```

The backend integration test exercises HTTP routing, order totals, stock updates, rejection of invalid quantities/insufficient stock, user isolation, valid Mini App authentication, and tampering. Two Python tests use mocks to check the welcome flow and ordering integration. These mock tests do not prove a live Telegram connection.

## Structure

- `bot/main.py`: Python Bot API client, inline keyboards, sticker upload, order flow.
- `bot/welcome.webp`: original sticker.
- `backend/server.js`: HTTP API, Telegram signature validation, SQLite transactions.
- `backend/index.html`: Mini App catalog and order history.
- `report/REPORT.md`, `report/Lab3-report.pdf`, `report/Lab3-report.docx`, and `report/Lab3-report.html`: report for Matvei Krautsou with four genuine mobile-browser screenshots and full source appendices. `Lab3-Matvei-Krautsou.zip` contains the complete submission.

## Limitations

This is a laboratory prototype: no payments, shipping, stock administration, or production deployment automation. Orders are independent purchases; API retries do not have idempotency keys. A repeated confirmation may create another order. Live Telegram testing and Telegram screenshots require the student's BotFather token and HTTPS deployment. The bot token was verified with Telegram and the student supplied screenshots demonstrating live purchases and history. The report documents those observations. Original Telegram screenshots still need uploading as files for embedding; inline chat images were not available to the report builder.

## Rebuild the submission report

Install optional report tools with `python -m pip install reportlab python-docx Pillow`, then run `python report/build_report.py`. The generator builds PDF, DOCX, standalone HTML, and a secret-free ZIP. Mini App images are actual local Chromium captures. They do not imply a public HTTPS Mini App deployment.
