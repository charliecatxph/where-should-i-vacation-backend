import db from "../dependencies/firestore.js";
import jwt from "jsonwebtoken";
import { sign } from "../dependencies/jwt_sign.js";

const SECRET_ACCESS = process.env.SECRET_ACCESS;
const SECRET_REFRESH = process.env.SECRET_REFRESH;

const secureCTXgate = async (req, res, next) => {
  const accessToken = req.headers.authorization?.split(" ")[1] || "";
  const refreshToken = req.cookies.refreshToken;

  if (!accessToken) {
    return res.status(401).json({
      err: "Token is missing or invalid.",
    });
  }

  try {
    const userData = jwt.verify(accessToken, SECRET_ACCESS);
    req.accessToken = accessToken;
    req.user = userData;
    next();
  } catch (e) {
    if (!refreshToken) {
      return res.status(401).json({
        err: "Token is missing or invalid.",
      });
    }

    try {
      const decodedRefreshToken = jwt.verify(refreshToken, SECRET_REFRESH);
      const id = decodedRefreshToken.id;

      const userData = await db
        .collection("users")
        .doc(id)
        .get()
        .catch((e) => {
          throw new Error("User data fetch error.");
        });

      const { accessToken: newAccessToken } = sign({
        id,
        name: userData.data().name,
        email: userData.data().email,
        credits: userData.data().credits,
      });

      req.accessToken = newAccessToken;
      req.user = decodedRefreshToken;
      next();
    } catch (e) {
      return res.status(401).json({
        err: "Token is missing or invalid.",
      });
    }
  }
};

export { secureCTXgate };
