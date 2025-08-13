const logout = (req, res) => {
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

  return res.status(200).json({
    msg: "OK",
  });
};

module.exports = { logout };
