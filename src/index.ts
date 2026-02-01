import { toNodeHandler } from "h3/node";
import { listen } from "listhen";
import { connectToWhatsApp } from "./whatsapp.ts";
import { app } from "./server.ts";

const PORT = process.env.PORT || 3000;

connectToWhatsApp();
listen(toNodeHandler(app), { port: PORT });

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
