import "dotenv/config";
import { Timestamp } from "firebase-admin/firestore";
import db from "../../dependencies/firestore.js";
import bcrypt from "bcrypt";
import transporter from "../../dependencies/transporter.js";

const register = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name.trim() || !email.trim() || !password.trim()) {
        return res.status(400).json({
            code: "PARAMETERS_INCOMPLETE",
        });
    }

    try {
        const dbCheck = await db
            .collection("users")
            .where("email", "==", email.trim())
            .get()
            .catch((e) => {
                throw new Error(e.message);
            });

        if (!dbCheck.empty) {
            return res.status(400).json({
                code: "USER_ALREADY_EXISTS",
            });
        }

        const enc = await bcrypt.hash(password, 10).catch((e) => {
            throw new Error("Fail to hash password.");
        });

        const newUser = await db.collection("users").add({
            name: name.trim(),
            email: email.trim(),
            password: enc,
            generation_credits: parseInt(process.env.DEFAULT_CREDITS_VALUE),
            generation_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
            itinerary_credits: parseInt(process.env.DEFAULT_ITINERARY_CREDITS_VALUE),
            itinerary_credits_ttl: Timestamp.fromMillis(new Date().getTime()),
            updated_at: Timestamp.fromMillis(new Date().getTime()),
            created_at: Timestamp.fromMillis(new Date().getTime()),
            method: "manual",
            verified: false,
        });

        const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome Aboard - Where Should I Vacation</title>
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
            .welcome-box { 
                background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%); 
                border: 1px solid #f59e0b; 
                border-radius: 8px; 
                padding: 25px; 
                margin: 25px 0; 
                text-align: center;
            }
            .welcome-icon {
                font-size: 48px;
                margin-bottom: 15px;
            }
            .welcome-text {
                font-size: 20px;
                font-weight: 600;
                color: #92400e;
                margin-bottom: 8px;
            }
            .welcome-subtitle {
                font-size: 14px;
                color: #b45309;
            }
            .verify-button { 
                display: inline-block; 
                background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%); 
                color: white !important; 
                padding: 18px 36px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600; 
                font-size: 16px; 
                margin: 25px 0; 
                transition: transform 0.2s ease;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }
            .verify-button:hover { 
                transform: translateY(-2px); 
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            }
            .features-box { 
                background-color: #fff7ed; 
                border: 1px solid #fb923c; 
                border-radius: 8px; 
                padding: 20px; 
                margin: 25px 0; 
                font-size: 14px; 
                color: #9a3412;
            }
            .features-box h3 {
                margin-top: 0;
                color: #ea580c;
                font-size: 16px;
            }
            .features-box ul {
                margin: 10px 0;
                padding-left: 20px;
            }
            .features-box li {
                margin-bottom: 8px;
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
                <h1>🎉 Welcome Aboard!</h1>
                <div class="app-name">Where Should I Vacation</div>
            </div>
            <div class="content">
                <div class="greeting">Hello ${name.trim()}!</div>
                <div class="message">
                    Welcome to Where Should I Vacation! We're absolutely thrilled to have you join our community of adventure seekers and travel enthusiasts. 
                    Your journey to discovering amazing destinations starts here! ✈️
                </div>
                
                <div class="welcome-box">
                    <div class="welcome-icon">🌍✨</div>
                    <div class="welcome-text">Your Adventure Awaits!</div>
                    <div class="welcome-subtitle">Let's verify your account and get you started</div>
                </div>

                <div class="message">
                    To unlock all the amazing features and start planning your next getaway, please verify your email address by clicking the button below:
                </div>

                <div style="text-align: center;">
                    <a href="${process.env.ORIGIN}/verify-account?acctId=${newUser.id}" class="verify-button">Verify My Account</a>
                </div>

                <div class="features-box">
                    <h3>🚀 What's waiting for you:</h3>
                    <ul>
                        <li>Personalized travel recommendations powered by AI</li>
                        <li>Custom itinerary planning for your perfect trip</li>
                        <li>Discover hidden gems and popular destinations</li>
                        <li>Save and organize your favorite travel ideas</li>
                        <li>Connect with fellow travelers and share experiences</li>
                    </ul>
                </div>

                <div class="link-text">
                    <strong>Having trouble with the button?</strong> Copy and paste this link into your browser:<br>
                    <span style="word-break: break-all; color: #ea580c;">${process.env.ORIGIN}/verify-account?acctId=${newUser.id}</span>
                </div>
            </div>
            <div class="footer">
                <p>This is an automated message. Please don't reply to this email.</p>
                <p>Questions? We're here to help! Reach out to our friendly support team.</p>
                <div class="contact-email">info@whereshouldivacation.com</div>
            </div>
        </div>
    </body>
    </html>
  `;

        const textTemplate = `
🎉 WELCOME ABOARD - WHERE SHOULD I VACATION

Hello ${name.trim()}!

Welcome to Where Should I Vacation! We're absolutely thrilled to have you join our community of adventure seekers and travel enthusiasts.

Your journey to discovering amazing destinations starts here! ✈️

🌍 YOUR ADVENTURE AWAITS!
To unlock all the amazing features and start planning your next getaway, please verify your email address by clicking the link below:

${process.env.ORIGIN}/verify-account?acctId=${newUser.id}

🚀 WHAT'S WAITING FOR YOU:
- Personalized travel recommendations powered by AI
- Custom itinerary planning for your perfect trip
- Discover hidden gems and popular destinations
- Save and organize your favorite travel ideas
- Connect with fellow travelers and share experiences

---
This is an automated message. Please don't reply to this email.

Questions? We're here to help! Contact us at info@whereshouldivacation.com
  `;

        const mailOptions = {
            from: `Where Should I Vacation <${process.env.TRANSPORTER_EMAIL}>`,
            to: email.trim(),
            subject: "🎉 Welcome to Where Should I Vacation [Verify Your Account]",
            text: textTemplate,
            html: htmlTemplate,
        };

        transporter.sendMail(mailOptions).catch(async (e) => {
            console.log(
                `[${new Date().toISOString()}] [Register, Send Mail] Exception at ${req.originalUrl}. Error data: ${e.message}`
            );
        });

        return res.status(200).json({
            msg: "User has been registered.",
        });
    } catch (e) {
        console.log(
            `[${new Date().toISOString()}] [Register] Exception at ${req.originalUrl}. Error data: ${e.message}`
        );
        return res.status(500).json({
            code: "SERVER_ERROR",
            err: e.message,
        });
    }
};

export { register };
