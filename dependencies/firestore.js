import "dotenv/config";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: cert(JSON.parse(process.env.SERVICE_ACCOUNT)),
});

const db = getFirestore();

export default db;
