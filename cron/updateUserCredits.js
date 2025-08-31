import "dotenv/config";

import db from "../dependencies/firestore.js";
import cron from "node-cron";
import moment from "moment";
import { Timestamp } from "firebase-admin/firestore";

const updateGenerationCredits = async () => {
  try {
    // check if generation_credits_last_used is + 1 d
    const users = await db
      .collection("users")
      .where(
        "generation_credits_last_used",
        "<=",
        moment().add(1, "day").unix()
      )
      .get();
    if (!users.empty) {
      for (const user of users.docs) {
        const userData = user.data();
        if (userData.generation_credits <= 0) {
          await db
            .collection("users")
            .doc(user.id)
            .update({
              ...userData,
              generation_credits: process.env.DEFAULT_CREDITS_VALUE,
              updated_at: Timestamp.fromMillis(new Date().getTime()),
            });
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
};

const updateItineraryCredits = async () => {
  try {
    // check if itinerary_credits_last_used is + 1 m
    const users = await db
      .collection("users")
      .where(
        "itinerary_credits_last_used",
        "<=",
        moment().add(1, "month").unix()
      )
      .get();
    if (!users.empty) {
      for (const user of users.docs) {
        const userData = user.data();
        if (userData.itinerary_credits <= 0) {
          await db
            .collection("users")
            .doc(user.id)
            .update({
              ...userData,
              itinerary_credits: process.env.DEFAULT_ITINERARY_CREDITS_VALUE,
              updated_at: Timestamp.fromMillis(new Date().getTime()),
            });
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
};

// asynchronous check
const runUserCreditReset = () => {
  cron.schedule("0 0 * * *", async () => {
    // await updateGenerationCredits();
    // await updateItineraryCredits();
  });
};

export { runUserCreditReset };
