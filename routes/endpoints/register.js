const { Timestamp } = require("firebase-admin/firestore");
const db = require("../../dependencies/firestore");
const bcrypt = require("bcrypt");
const { sign } = require("../../dependencies/jwt_sign");

const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name.trim() || !email.trim() || !password.trim()) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const dbCheck = await db
      .collection("users")
      .where("email", "==", email.trim())
      .get()
      .catch((e) => {
        throw new Error("Fail to fetch users.");
      });

    if (!dbCheck.empty) {
      return res.status(400).json({
        code: "USER_ALREADY_EXISTS",
      });
    }

    const enc = await bcrypt.hash(password, 10).catch((e) => {
      throw new Error("Fail to hash password.");
    });

    const newUser = await db.collection("users").add({
      name: name.trim(),
      email: email.trim(),
      password: enc,
      generation_credits: parseInt(process.env.DEFAULT_CREDITS_VALUE),
      generation_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
      itinerary_credits: parseInt(process.env.DEFAULT_ITINERARY_CREDITS_VALUE),
      itinerary_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
      updated_at: Timestamp.fromMillis(new Date().getTime()),
      created_at: Timestamp.fromMillis(new Date().getTime()),
      method: "manual",
    });

    const { accessToken, refreshToken } = sign({
      id: newUser.id,
      name: name.trim(),
      email: email.trim(),
      generation_credits: parseInt(process.env.DEFAULT_CREDITS_VALUE),
      itinerary_credits: parseInt(process.env.DEFAULT_ITINERARY_CREDITS_VALUE),
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.MODE === "PRODUCTION",
      sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
      path: "/",
      domain:
        process.env.MODE === "PRODUCTION"
          ? ".whereshouldivacation.com"
          : undefined,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.MODE === "PRODUCTION", // Ensures it is only sent over HTTPS
      sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      domain:
        process.env.MODE === "PRODUCTION"
          ? ".whereshouldivacation.com"
          : undefined,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      msg: "User has been registered.",
      token: accessToken,
    });
  } catch (e) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: err.message,
    });
  }
};

module.exports = { register };
