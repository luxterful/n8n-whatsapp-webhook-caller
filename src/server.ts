import { H3 } from "h3";
import { z } from "zod";
import { getSocket } from "./whatsapp.ts";

const sendMessageSchema = z.object({
  to: z.string().min(1),
  message: z.string().min(1),
});

export const app = new H3();

app.post("/api/send-message", async (event) => {
  console.log("Received request to /api/send-message");
  const sock = getSocket();
  if (!sock) {
    return { success: false, error: "WhatsApp not connected" };
  }

  const body = await event.req.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors };
  }

  try {
    await sock.sendMessage(parsed.data.to, { text: parsed.data.message });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});
