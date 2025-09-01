import db from "../../dependencies/firestore.js";

const verifyAccount = async (req, res) => {
 const { acctId } = req.body;

 if (!acctId || !acctId.trim()) {
  return res.status(400).json({
   code: "PARAMETERS_INCOMPLETE",
  });
 }

 try {
  const userDoc = await db.collection("users").doc(acctId.trim()).get();

  if (!userDoc.exists) {
   return res.status(400).json({
    code: "USER_NOT_FOUND",
   });
  }

  const userData = userDoc.data();

  if (userData.verified === true) {
   return res.status(409).json({
    code: "ACCOUNT_ALREADY_VERIFIED",
   });
  }

  if (userData.verification_ttl.toMillis() < Date.now()) {
   await db.collection("users").doc(userDoc.id).delete()
   return res.status(400).json({
    code: "VERIFICATION_EXPIRED",
   });
  }

  await db.collection("users").doc(acctId.trim()).update({
   verified: true,
  });

  return res.status(200).json({
   msg: "Account has been verified successfully.",
  });
 } catch (e) {
  console.log(
   `[${new Date().toISOString()}] [Verify Account] Exception at ${req.originalUrl}. Error data: ${e.message}`
  );
  return res.status(500).json({
   code: "SERVER_ERROR",
   err: e.message,
  });
 }
};

export default verifyAccount;