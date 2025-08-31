import "dotenv/config";
import db from "../../dependencies/firestore.js";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import transporter from "../../dependencies/transporter.js";

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    console.log("Forgot password endpoint hit.")

    if (!email.trim()) {
        return res.status(400).json({
            code: "PARAMETERS_INCOMPLETE",
        });
    }

    try {
        const userCheck = await db.collection("users").where("email", "==", email.trim()).get();

        if (userCheck.empty) {
            return res.sendStatus(200);
        }

        if (userCheck.docs[0].data().verified === false) {
            return res.sendStatus(200);
        }

        if (userCheck.docs[0].data().method === "google") {
            return res.sendStatus(200);
        }

        const uuid = uuidv4();
        const ttl = moment.utc().add(15, "minutes").valueOf();

        await db.collection("password-reset-history").doc(uuid).set({
            email: email.trim(),
            ttl,
            userId: userCheck.docs[0].id,
        });

        const resetLink = `${process.env.ORIGIN}/reset-password?uuid=${uuid}`;


        const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password - Where Should I Vacation</title>
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
            .reset-button { 
                display: inline-block; 
                background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%); 
                color: white !important; 
                padding: 16px 32px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600; 
                font-size: 16px; 
                margin: 20px 0; 
                transition: transform 0.2s ease;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }
            .reset-button:hover { 
                transform: translateY(-2px); 
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            }
            .link-text { 
                font-size: 14px; 
                color: #718096; 
                margin-top: 20px; 
                padding: 20px; 
                background-color: #fff7ed; 
                border-radius: 8px; 
                border-left: 4px solid #ea580c;
            }
            .footer { 
                background-color: #fff7ed; 
                padding: 30px; 
                text-align: center; 
                font-size: 14px; 
                color: #718096; 
                border-top: 1px solid #fed7aa;
            }
            .security-note { 
                background-color: #fff7ed; 
                border: 1px solid #fb923c; 
                border-radius: 8px; 
                padding: 16px; 
                margin: 20px 0; 
                font-size: 14px; 
                color: #9a3412;
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
                <h1>Password Reset</h1>
                <div class="app-name">Where Should I Vacation</div>
            </div>
            <div class="content">
                <div class="greeting">Hello there!</div>
                <div class="message">
                    We received a request to reset your password for your Where Should I Vacation account. No worries, it happens to the best of us! 
                    Click the button below to create a new password and get back to planning your next adventure.
                </div>
                <div style="text-align: center;">
                    <a href="${resetLink}" class="reset-button">Reset My Password</a>
                </div>
                <div class="security-note">
                    <strong>⚡ Quick heads up:</strong> This link will expire in 15 minutes for your security. 
                    If you didn't request this reset, you can safely ignore this email.
                </div>
                <div class="link-text">
                    <strong>Having trouble with the button?</strong> Copy and paste this link into your browser:<br>
                    <span style="word-break: break-all; color: #ea580c;">${resetLink}</span>
                </div>
            </div>
            <div class="footer">
                <p>This is an automated message. Please don't reply to this email.</p>
                <p>If you have any questions, feel free to contact our support team.</p>
                <div class="contact-email">info@whereshouldivacation.com</div>
            </div>
        </div>
    </body>
    </html>
  `;


        const textTemplate = `
🔐 PASSWORD RESET REQUEST - WHERE SHOULD I VACATION

Hello there!

We received a request to reset your password for your Where Should I Vacation account. No worries, it happens to the best of us!

To reset your password, please click on the following link or copy and paste it into your browser:

${resetLink}

⚡ IMPORTANT SECURITY NOTICE:
- This link will expire in 15 minutes for your security
- If you didn't request this password reset, you can safely ignore this email
- Never share this link with anyone else

Having trouble? Contact our support team at info@whereshouldivacation.com

---
This is an automated message. Please don't reply to this email.
  `;

        const mailOptions = {
            from: `Where Should I Vacation <${process.env.TRANSPORTER_EMAIL}>`,
            to: email.trim(),
            subject: "Where Should I Vacation [Password Reset]",
            text: textTemplate,
            html: htmlTemplate
        }


        transporter.sendMail(mailOptions).catch(async (e) => {

            try {
                await db.collection("password-reset-history").doc(uuid).delete();
            } catch (e) {
                console.log(
                    `[${new Date().toISOString()}] [Forgot Password] Exception at ${req.originalUrl}. Error data: ${e.message}`
                );
            }
        });

        return res.sendStatus(200);
    } catch (e) {
        console.log(
            `[${new Date().toISOString()}] [Forgot Password] Exception at ${req.originalUrl}. Error data: ${e.message}`
        );
        return res.status(500).json({
            code: "SERVER_ERROR",
            err: e.message,
        });
    }
}

export default forgotPassword;