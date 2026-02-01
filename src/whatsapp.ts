import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "baileys";
import type { WASocket } from "baileys";
import qrcode from "qrcode-terminal";

const { WEBHOOK_URL } = process.env;

if (!WEBHOOK_URL) {
  console.error("WEBHOOK_URL is required");
  process.exit(1);
}

let sock: WASocket | null = null;

export function getSocket(): WASocket | null {
  return sock;
}

export async function forwardToWebhook(payload: Record<string, unknown>) {
  try {
    const res = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(
        `Webhook responded with ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err: unknown) {
    console.error("Failed to call webhook:", (err as Error).message);
  }
}

export async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestWaWebVersion({});

  console.log("Using WA Web version:", version);

  sock = makeWASocket({
    auth: state,
    version,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed, reconnecting:", shouldReconnect);
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === "open") {
      console.log("Connected to WhatsApp");
    }
  });

  sock.ev.on("messages.upsert", async (event) => {
    for (const msg of event.messages) {
      if (
        msg.key.remoteJid === "status@broadcast" ||
        msg.key.fromMe ||
        msg.message?.reactionMessage
      )
        continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      const payload = {
        type: "message",
        message_id: msg.key.id,
        from: msg.key.participant || msg.key.remoteJid,
        chat: msg.key.remoteJid,
        timestamp: msg.messageTimestamp,
        text,
        pushName: msg.pushName,
        message: msg.message,
      };

      console.log("Received message, forwarding to webhook:", msg);
      await forwardToWebhook(payload);
    }
  });

  sock.ev.on("messages.reaction", async (reactions) => {
    for (const reaction of reactions) {
      const payload = {
        type: "reaction",
        message_id: reaction.key.id,
        chat: reaction.key.remoteJid,
        from: reaction.key.participant || reaction.key.remoteJid,
        reaction: reaction.reaction,
      };

      console.log("Received reaction, forwarding to webhook", reaction);
      await forwardToWebhook(payload);
    }
  });
}
