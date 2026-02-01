import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "baileys";
import qrcode from "qrcode-terminal";
import { H3 } from "h3";
import { toNodeHandler } from "h3/node";
import { listen } from "listhen";

const { WEBHOOK_URL } = process.env;
const PORT = process.env.PORT || 3000;

let sock = null;

if (!WEBHOOK_URL) {
  console.error("WEBHOOK_URL is required");
  process.exit(1);
}

async function forwardToWebhook(payload) {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(
        `Webhook responded with ${res.status}: ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("Failed to call webhook:", err.message);
  }
}

async function connectToWhatsApp() {
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
      const statusCode = lastDisconnect?.error?.output?.statusCode;
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
      // Skip status broadcasts and messages sent by us
      if (msg.key.remoteJid === "status@broadcast" || msg.key.fromMe) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      const payload = {
        message_id: msg.key.id,
        from: msg.key.participant || msg.key.remoteJid,
        chat: msg.key.remoteJid,
        timestamp: msg.messageTimestamp,
        text,
        pushName: msg.pushName,
        message: msg.message,
      };

      console.log("Received message, forwarding to webhook:", text);
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

      console.log("Received reaction, forwarding to webhook");
      await forwardToWebhook(payload);
    }
  });
}

// HTTP server
const app = new H3();

app.post("/api/send-message", async (event) => {
  console.log("Received request to /api/send-message");
  if (!sock) {
    return { success: false, error: "WhatsApp not connected" };
  }

  const { to, message } = await event.req.json();

  if (!to || !message) {
    return { success: false, error: '"to" and "message" are required' };
  }
  try {
    await sock.sendMessage(to, { text: message });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

connectToWhatsApp();
listen(toNodeHandler(app), { port: PORT });

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
