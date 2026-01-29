import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
} from "baileys";
import qrcode from "qrcode-terminal";

const { WEBHOOK_URL } = process.env;

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
      console.error(`Webhook responded with ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("Failed to call webhook:", err.message);
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestWaWebVersion({});

  console.log("Using WA Web version:", version);

  const sock = makeWASocket({
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

connectToWhatsApp();

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
