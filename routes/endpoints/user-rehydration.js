const jwt = require("jsonwebtoken");
const db = require("../../dependencies/firestore");
const { sign } = require("../../dependencies/jwt_sign");
const { Timestamp } = require("firebase-admin/firestore");
const SECRET_REFRESH = process.env.SECRET_REFRESH;
const moment = require("moment");

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
        throw new Error("User data fetch error.");
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
    console.log(e);
    res.status(401).json({
      err: "AUTHENTICATION_ERROR",
    });
  }
};

module.exports = { userRehydration };
