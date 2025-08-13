require("dotenv").config();
const express = require("express");
const db = require("../../dependencies/firestore");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const eps = process.env.STRIPE_WEBHOOK_SECRET;

const creditAdditions = {
  explorer: parseInt(process.env.EXPLORER_CREDITS),
  journeyman: parseInt(process.env.JOURNEYMAN_CREDITS),
};

const itineraryCreditAdditions = {
  explorer: parseInt(process.env.EXPLORER_CREDITS_ITINERARY),
  journeyman: parseInt(process.env.JOURNEYMAN_CREDITS_ITINERARY),
};

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let ev = req.body;
    try {
      const sig = req.headers["stripe-signature"];
      ev = stripe.webhooks.constructEvent(req.body, sig, eps);
    } catch (e) {
      console.log("Webhook signature verification failed.", e.message);
      return res.sendStatus(400);
    }
    if (ev.type === "checkout.session.completed") {
      const session = ev.data.object;

      const metadata = session.metadata;
      try {
        const user = await db.collection("users").doc(metadata.userId).get();
        if (!user.exists) throw new Error("User doesn't exist.");

        await db
          .collection("users")
          .doc(metadata.userId)
          .update({
            ...user.data(),
            generation_credits:
              user.data().generation_credits +
              creditAdditions[metadata.itemCode],
            itinerary_credits:
              user.data().itinerary_credits +
              itineraryCreditAdditions[metadata.itemCode],
          });
      } catch (e) {
        console.log("Something failed in adding user: ", e.message);
      }
    }
    res.json({ received: true });
  }
);

module.exports = router;
