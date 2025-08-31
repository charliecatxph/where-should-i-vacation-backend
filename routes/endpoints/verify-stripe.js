import "dotenv/config";
import db from "../../dependencies/firestore.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET);

const verifyStripe = async (req, res) => {
  const { session_id } = req.body;

  if (!session_id.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  const invalidationCheck = await db
    .collection("stripe-session-id-revocation")
    .where("session_id", "==", session_id)
    .get();

  if (!invalidationCheck.empty) {
    return res.status(400).json({
      code: "TOKEN_REVOKED",
    });
  }

  try {
    const stx = await stripe.checkout.sessions.retrieve(session_id);

    await db.collection("stripe-session-id-revocation").add({
      session_id: session_id,
    });
    res.json({
      itemCode: stx.metadata.itemCode,
    });
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Verify Stripe] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
    });
  }
};

export { verifyStripe };
