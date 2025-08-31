import "dotenv/config";
import jwt from "jsonwebtoken";

const SECRET_ACCESS = process.env.SECRET_ACCESS;
const SECRET_REFRESH = process.env.SECRET_REFRESH;

const sign = (data) => {
  const accessToken = jwt.sign(data, SECRET_ACCESS, {
    expiresIn: 24 * 60 * 60,
  });
  const refreshToken = jwt.sign({ id: data.id }, SECRET_REFRESH, {
    expiresIn: 30 * 24 * 60 * 60,
  });
  return {
    accessToken,
    refreshToken,
  };
};

export { sign };
