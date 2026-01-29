# n8n WhatsApp Webhook Caller

WhatsApp bot that forwards incoming messages and reactions to a configurable webhook URL (e.g. n8n).

Uses [Baileys](https://github.com/WhiskeySockets/Baileys) to connect via WhatsApp Web's linked devices feature.

## Configuration

| Variable | Description |
|---|---|
| `WEBHOOK_URL` | Target webhook endpoint |

## Setup

1. Copy `.env.example` to `.env` and set your webhook URL
2. `npm install`
3. `npm start`
4. Scan the QR code with WhatsApp (Linked Devices)

Session credentials are persisted in the `auth_info` directory.

## Docker

```bash
docker compose up -d
# Check logs for QR code on first run:
docker compose logs -f
```
