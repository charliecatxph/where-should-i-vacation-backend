import "dotenv/config";
import axios from "axios";
import db from "../../dependencies/firestore.js";
import jwt from "jsonwebtoken";
import { sign } from "../../dependencies/jwt_sign.js";
import { Timestamp } from "firebase-admin/firestore";

const googleSSO = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      code: "PARAMETERS_INCOMPLETE",
    });
  }

  try {
    const exchange_code = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        code,
        client_id: process.env.GOOGLE_SSO_CLIENT_ID,
        client_secret: process.env.GOOGLE_SSO_CLIENT_SECRET,
        redirect_uri: process.env.MODE === "PRODUCTION" ? process.env.ORIGIN + "/finish_google_sso" : `http://localhost:${process.env.PORT}/finish_google_sso`,
        grant_type: "authorization_code",
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const { id_token } = exchange_code.data;
    const userData = jwt.decode(id_token);

    // Check if user exists in DB, if empty, create that user
    const check_user = await db
      .collection("users")
      .where("email", "==", userData.email)
      .get();
    if (check_user.empty) {
      const newUser = await db.collection("users").add({
        name: userData.name,
        email: userData.email,
        password: "",
        generation_credits: parseInt(process.env.DEFAULT_CREDITS_VALUE),
        generation_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
        itinerary_credits: parseInt(
          process.env.DEFAULT_ITINERARY_CREDITS_VALUE
        ),
        itinerary_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
        updated_at: Timestamp.fromMillis(new Date().getTime()),
        created_at: Timestamp.fromMillis(new Date().getTime()),
        method: "google",
        verified: true,
      });

      const { accessToken, refreshToken } = sign({
        id: newUser.id,
        name: userData.name,
        email: userData.email,
        generation_credits: parseInt(process.env.DEFAULT_CREDITS_VALUE),
        itinerary_credits: parseInt(
          process.env.DEFAULT_ITINERARY_CREDITS_VALUE
        ),
      });

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.MODE === "PRODUCTION",
        sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
        path: "/",
        domain:
          process.env.MODE === "PRODUCTION"
            ? process.env.SERVER_URL
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
            ? process.env.SERVER_URL
            : undefined,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return res.status(200).json({
        msg: "User has been registered.",
        token: accessToken,
      });
    } else {
      const udf = check_user.docs[0].data();
      if (udf.method !== "google")
        throw new Error("User already exists with your email.");

      const { accessToken, refreshToken } = sign({
        id: check_user.docs[0].id,
        name: udf.name,
        email: udf.email,
        generation_credits: udf.generation_credits,
        itinerary_credits: udf.itinerary_credits,
      });

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.MODE === "PRODUCTION",
        sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
        path: "/",
        domain:
          process.env.MODE === "PRODUCTION"
            ? process.env.SERVER_URL
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
            ? process.env.SERVER_URL
            : undefined,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      return res.status(200).json({
        msg: "User has been logged in.",
        token: accessToken,
      });
    }
  } catch (e) {
    console.log(
      `[${new Date().toISOString()}] [Google SSO] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    return res.status(500).json({
      code: "SERVER_ERROR",
      err: e.message,
    });
  }
};

export { googleSSO };
