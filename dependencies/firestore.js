require("dotenv").config();

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({
  credential: cert(JSON.parse(process.env.SERVICE_ACCOUNT)),
});

const db = getFirestore();

module.exports = db;
