import "dotenv/config";
import jwt from "jsonwebtoken";
import db from "../../dependencies/firestore.js";
import { sign } from "../../dependencies/jwt_sign.js";
import { Timestamp } from "firebase-admin/firestore";
const SECRET_REFRESH = process.env.SECRET_REFRESH;
import moment from "moment";

const userRehydration = async (req, res) => {
  const refreshToken = req.headers?.cookie || "";
  if (!refreshToken) {
    return res.status(500).json({
      code: "TOKEN_MISSING",
    });
  }

  try {
    const refreshTokenDecode = jwt.verify(refreshToken, SECRET_REFRESH);
    const id = refreshTokenDecode.id;

    const user = await db
      .collection("users")
      .doc(id)
      .get()
      .catch((e) => {
        throw new Error(e.message);
      });

    const userData = user.data();

    const generationTokenRecycle =
      moment(userData.generation_credits_ttl.seconds * 1000)
        .add(1, "day")
        .unix() <= moment().unix() && userData.generation_credits <= 0;
    const itineraryTokenRecycle =
      moment(userData.itinerary_credits_ttl.seconds * 1000)
        .add(1, "month")
        .unix() <= moment().unix() && userData.itinerary_credits <= 0;

    if (generationTokenRecycle || itineraryTokenRecycle) {
      await db
        .collection("users")
        .doc(id)
        .update({
          ...userData,
          updated_at: Timestamp.fromMillis(new Date().getTime()),
          generation_credits: generationTokenRecycle
            ? parseInt(process.env.DEFAULT_CREDITS_VALUE)
            : userData.generation_credits,
          itinerary_credits: itineraryTokenRecycle
            ? parseInt(process.env.DEFAULT_ITINERARY_CREDITS_VALUE)
            : userData.itinerary_credits,
        });
    }

    const { accessToken: newAccessToken } = sign({
      id,
      name: userData.name,
      email: userData.email,
      generation_credits: generationTokenRecycle
        ? process.env.DEFAULT_CREDITS_VALUE
        : userData.generation_credits,
      itinerary_credits: itineraryTokenRecycle
        ? process.env.DEFAULT_ITINERARY_CREDITS_VALUE
        : userData.itinerary_credits,
    });
    res.status(200).json({
      token: newAccessToken,
    });
  } catch (e) {
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.MODE === "PRODUCTION",
      sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
      path: "/",
      domain:
        process.env.MODE === "PRODUCTION" ? process.env.SERVER_URL : undefined,
    });
  
    console.log(
      `[${new Date().toISOString()}] [User Rehydration] Exception at ${req.originalUrl}. Error data: ${e.message}`
    );
    res.status(401).json({
      err: "AUTHENTICATION_ERROR",
    });
  }
};

export { userRehydration };
