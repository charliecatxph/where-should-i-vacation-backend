const db = require("../../dependencies/firestore");
const { sign } = require("../../dependencies/jwt_sign");
const bcrypt = require("bcrypt");

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email.trim() || !password.trim()) {
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

    if (dbCheck.empty) {
      return res.status(400).json({
        code: "USER_NOT_FOUND",
      });
    }

    const user = dbCheck.docs[0].data();
    if (user.method !== "manual") {
      return res.status(400).json({
        code: "USER_NOT_FOUND",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(400).json({
        code: "INVALID_CREDENTIALS",
      });
    }

    const { accessToken, refreshToken } = sign({
      id: dbCheck.docs[0].id,
      name: user.name,
      email: user.email,
      generation_credits: user.generation_credits,
      itinerary_credits: user.itinerary_credits,
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.MODE === "PRODUCTION",
      sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
      path: "/",
      domain:
        process.env.MODE === "PRODUCTION" ? process.env.SERVER_URL : undefined,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.MODE === "PRODUCTION", // Ensures it is only sent over HTTPS
      sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      domain:
        process.env.MODE === "PRODUCTION" ? process.env.SERVER_URL : undefined,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      msg: "User has been logged in.",
      token: accessToken,
    });
  } catch (e) {
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: err.message,
    });
  }
};

module.exports = { login };
