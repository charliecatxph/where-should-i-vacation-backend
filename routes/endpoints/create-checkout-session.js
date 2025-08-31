import "dotenv/config";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET);

const products = ["Explorer", "Journeyman"];
const createCheckoutSession = async (req, res) => {
  const { plan } = req.body;

  if (!plan.trim() || !products.includes(plan.trim())) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  const stripeProducts = {
    Explorer: "price_1RuZPBIAkgxX8BBZ2w7al33W",
    Journeyman: "price_1RuZPgIAkgxX8BBZeFRaj4na",
  };

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: stripeProducts[plan],
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.ORIGIN}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.ORIGIN}/`,
      metadata: {
        userId: req.user.id,
        itemCode: plan.trim().toLowerCase(),
      },
    });
    res.json({
      url: session.url,
    });
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Create Checkout Session] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { createCheckoutSession };
