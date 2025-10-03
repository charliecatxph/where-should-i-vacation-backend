import "dotenv/config";

const logout = (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.MODE === "PRODUCTION",
    sameSite: process.env.MODE === "PRODUCTION" ? "None" : "Lax",
    path: "/",
    domain:
      process.env.MODE === "PRODUCTION" ? process.env.SERVER_URL : undefined,
  });

  return res.status(200).json({
    msg: "OK",
  });
};

export { logout };
