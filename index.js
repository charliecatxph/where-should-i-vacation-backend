require("dotenv").config();
const express = require("express");
const app = express();
const test = require("./response.json");

const cors = require("cors");

const master = require("./routes/master");
const stripe = require("./routes/stripe/stripe");
const cookieParser = require("cookie-parser");
const { runCacheCleanup } = require("./cron/cleanupOldCache");
const { getSphericalCenter } = require("./routes/endpoints/generate-itinerary");
const amadeus = require("./dependencies/amadeus");
const amadeusLimiter = require("./dependencies/rate-limiters/globalAmadeusLimiter");
const gcpLimiter = require("./dependencies/rate-limiters/globalGCPlimiter");
const {
  gcpMaps_placeDetailsEnterpriseGetHotelInfo,
} = require("./dependencies/GCP/PlaceDetailsEnterpriseGetHotelInfo");
const geoip = require("geoip-lite");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { runUserCreditReset } = require("./cron/updateUserCredits");

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
    console.log(e);
  }
};

app.use(
  cors({
    origin: process.env.ORIGIN,
    credentials: true,
  })
);
app.use("/api/stripe", stripe);
app.use(express.json());
app.use(express.urlencoded());
app.use(cookieParser());
``;
app.use("/api", master);
app.listen(process.env.PORT, async () => {
  createCacheDirectory();
  console.log(`📂 Created image cache folders.`);
  runCacheCleanup();
  console.log(`🧹 Cron TTL cleanup job is running.`);
  runUserCreditReset();
  console.log(`🪙  Cron User Credit Reset job is running.`);
  console.log(`✅ Server is listening at PORT ${process.env.PORT}`);
});

// testx();
