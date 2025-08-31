import "dotenv/config";
import jwt from 'jsonwebtoken';
import db from "../../dependencies/firestore.js";
import bcrypt from "bcrypt";
import transporter from "../../dependencies/transporter.js";

const changePassword = async (req, res) => {
    const { mode, uuid, pw, token } = req.body;

    if (!mode.trim()) {
        return res.status(400).json({
            code: "PARAMETERS_INCOMPLETE",
        });
    }

    try {
        if (mode === "sign") {
            if (!uuid.trim()) {
                return res.status(400).json({
                    code: "PARAMETERS_INCOMPLETE",
                });
            }

            const forgotPasswordCheck = await db.collection("password-reset-history").doc(uuid.trim()).get();

            if (forgotPasswordCheck.empty) {
                return res.status(400).json({
                    code: "INVALID_UUID",
                });
            }

            const token = jwt.sign({
                id: forgotPasswordCheck.data().userId,
                uuid: uuid.trim(),
            }, process.env.SECRET_ACCESS, {
                expiresIn: "24h",
            });

            res.json({
                token,
            });
        } else if (mode === "change") {
            if (!token.trim() || !pw) {
                return res.status(400).json({
                    code: "PARAMETERS_INCOMPLETE",
                });
            }

            const decoded = jwt.verify(token, process.env.SECRET_ACCESS);
            const userCheck = await db.collection("users").doc(decoded.id).get();

            if (userCheck.empty) {
                return res.status(400).json({
                    code: "USER_NOT_FOUND",
                });
            }

            const enc = await bcrypt.hash(pw, 10).catch((e) => {
                throw new Error("Fail to hash password.");
            });

            await db.collection("users").doc(decoded.id).update({
                password: enc,
            });

            await db.collection("password-reset-history").doc(decoded.uuid.trim()).delete();

            const user = userCheck.data();
            const userName = user.name;

            const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Changed Successfully - Where Should I Vacation</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0; 
                padding: 0; 
                background-color: #fef7ed;
            }
            .container { 
                max-width: 600px; 
                margin: 40px auto; 
                background: white; 
                border-radius: 12px; 
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                overflow: hidden;
            }
            .header { 
                background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%); 
                color: white; 
                padding: 40px 30px; 
                text-align: center; 
            }
            .header h1 { 
                margin: 0; 
                font-size: 28px; 
                font-weight: 600; 
            }
            .app-name {
                font-size: 16px;
                margin-top: 8px;
                opacity: 0.9;
                font-weight: 400;
            }
            .content { 
                padding: 40px 30px; 
            }
            .greeting { 
                font-size: 18px; 
                margin-bottom: 20px; 
                color: #2d3748;
            }
            .message { 
                font-size: 16px; 
                margin-bottom: 30px; 
                color: #4a5568; 
                line-height: 1.7;
            }
            .success-box { 
                background-color: #f0fdf4; 
                border: 1px solid #22c55e; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 20px 0; 
                text-align: center;
            }
            .success-icon {
                font-size: 48px;
                color: #22c55e;
                margin-bottom: 10px;
            }
            .success-text {
                font-size: 18px;
                font-weight: 600;
                color: #166534;
                margin-bottom: 5px;
            }
            .success-subtitle {
                font-size: 14px;
                color: #16a34a;
            }
            .security-tips { 
                background-color: #fff7ed; 
                border: 1px solid #fb923c; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 25px 0; 
                font-size: 14px; 
                color: #9a3412;
            }
            .security-tips h3 {
                margin-top: 0;
                color: #ea580c;
                font-size: 16px;
            }
            .security-tips ul {
                margin: 10px 0;
                padding-left: 20px;
            }
            .security-tips li {
                margin-bottom: 8px;
            }
            .footer { 
                background-color: #fff7ed; 
                padding: 30px; 
                text-align: center; 
                font-size: 14px; 
                color: #718096; 
                border-top: 1px solid #fed7aa;
            }
            .contact-email {
                margin-top: 15px;
                font-weight: 600;
                color: #ea580c;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Password Changed</h1>
                <div class="app-name">Where Should I Vacation</div>
            </div>
            <div class="content">
                <div class="greeting">Hello ${userName}!</div>
                <div class="message">
                    Great news! Your password for your Where Should I Vacation account has been successfully changed. 
                    Your account is now secured with your new password, and you're all set to continue planning your next amazing adventure.
                </div>
                
                <div class="success-box">
                    <div class="success-icon">✅</div>
                    <div class="success-text">Password Updated Successfully</div>
                    <div class="success-subtitle">Your account is now secured with your new password</div>
                </div>

                <div class="security-tips">
                    <h3>🔒 Keep Your Account Secure</h3>
                    <ul>
                        <li>Never share your password with anyone</li>
                        <li>Use a unique password that you don't use elsewhere</li>
                        <li>Consider using a password manager for better security</li>
                        <li>If you notice any suspicious activity, contact us immediately</li>
                    </ul>
                </div>

                <div class="message">
                    <strong>Didn't make this change?</strong> If you didn't request this password change, please contact our support team immediately at the email below. Your account security is our top priority.
                </div>
            </div>
            <div class="footer">
                <p>This is an automated message. Please don't reply to this email.</p>
                <p>If you have any questions or concerns, feel free to contact our support team.</p>
                <div class="contact-email">info@whereshouldivacation.com</div>
            </div>
        </div>
    </body>
    </html>
  `;

            const textTemplate = `
✅ PASSWORD CHANGED SUCCESSFULLY - WHERE SHOULD I VACATION

Hello ${userName}!

Great news! Your password for your Where Should I Vacation account has been successfully changed.

Your account is now secured with your new password, and you're all set to continue planning your next amazing adventure.

🔒 SECURITY TIPS:
- Never share your password with anyone
- Use a unique password that you don't use elsewhere  
- Consider using a password manager for better security
- If you notice any suspicious activity, contact us immediately

⚠️ DIDN'T MAKE THIS CHANGE?
If you didn't request this password change, please contact our support team immediately at info@whereshouldivacation.com. Your account security is our top priority.

---
This is an automated message. Please don't reply to this email.

Need help? Contact us at info@whereshouldivacation.com
  `;

            const mailOptions = {
                from: `Where Should I Vacation <${process.env.TRANSPORTER_EMAIL}>`,
                to: user.email,
                subject: "Where Should I Vacation [Password Changed Successfully]",
                text: textTemplate,
                html: htmlTemplate,
            };

            transporter.sendMail(mailOptions).catch(async (e) => {
                console.log(
                    `[${new Date().toISOString()}] [Change Password] Exception at ${req.originalUrl}. Error data: ${e.message}`
                );
            });

            res.json({
                msg: "Password has been changed.",
            });
        } else {
            return res.status(400).json({
                code: "INVALID_MODE",
            });
        }
    } catch (e) {
        console.log(
            `[${new Date().toISOString()}] [Change Password] Exception at ${req.originalUrl}. Error data: ${e.message}`
        );
        return res.status(500).json({
            code: "SERVER_ERROR",
            err: e.message,
        });
    }
}

export default changePassword;