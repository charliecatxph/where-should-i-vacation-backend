import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import master from "./routes/master.js";
import stripe from "./routes/stripe/stripe.js";
import { runCacheCleanup } from "./cron/cleanupOldCache.js";
import fs from "fs";
import path from "path";
import { runUserCreditReset } from "./cron/updateUserCredits.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createCacheDirectory = async () => {
  const folderNameOriginals = "gcp-image-cache";
  const folderNameCompressed = "gcp-image-cache-compressed";
  try {
    if (!fs.existsSync(folderNameOriginals)) {
      fs.mkdirSync(path.join(__dirname, folderNameOriginals));
    }

    if (!fs.existsSync(folderNameCompressed)) {
      fs.mkdirSync(path.join(__dirname, folderNameCompressed));
    }
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Create Cache Directory]. Error data: ${e.message
      }`
    );
  }
};

const corsInstance = cors({
  origin: process.env.ORIGIN,
  credentials: true,
});

const server = express();

server.use("/api/stripe", corsInstance, stripe);
server.use(
  "/api",
  corsInstance,
  express.json(),
  express.urlencoded(),
  cookieParser(),
  master
);

server.get("/", (req, res) => {
  res.send("Hello there :)")
})

server.listen(process.env.PORT, async () => {
  createCacheDirectory();
  console.log(`📂 Created image cache folders.`);
  runCacheCleanup();
  console.log(`🧹 Cron TTL cleanup job is running.`);
  runUserCreditReset();
  console.log(`🪙  Cron User Credit Reset job is running.`);
  console.log(`✅ Server is listening at PORT ${process.env.PORT}`);
});
