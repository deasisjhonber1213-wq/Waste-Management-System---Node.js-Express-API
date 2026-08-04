const nodemailer = require("nodemailer");

let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  // Verify connection/credentials on startup so bad creds show up
  // immediately in the logs instead of failing silently on first send.
  transporter.verify((err) => {
    if (err) {
      console.error("❌ Gmail SMTP connection failed:", err.message);
    } else {
      console.log("✅ Gmail SMTP ready to send emails");
    }
  });
} else {
  console.error("❌ GMAIL_USER / GMAIL_APP_PASSWORD is missing. Email not configured.");
}

/**
 * Modern branded HTML email template for SmartWaste
 */
function renderEmail({ eyebrow, title, intro, code, ctaText, ctaUrl, footnote }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#050b07;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050b07;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#0c1610;border:1px solid rgba(74,222,128,0.15);border-radius:20px;overflow:hidden;">
          
          <!-- Header / Logo -->
          <tr>
            <td style="padding:28px 32px 20px;background:linear-gradient(180deg, rgba(74,222,128,0.08) 0%, transparent 100%);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:40px;height:40px;background:#4ade80;border-radius:11px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:800;color:#060d08;line-height:40px;">S</span>
                  </td>
                  <td style="padding-left:12px;">
                    <div style="font-size:16px;font-weight:800;color:#4ade80;letter-spacing:-0.3px;">SmartWaste</div>
                    <div style="font-size:11px;color:#5c8a6a;margin-top:1px;">Jose Dalman Waste Monitoring</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:8px 32px 32px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#4ade80;margin-bottom:10px;">
                ${eyebrow || ""}
              </div>
              
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;color:#e8f7ed;letter-spacing:-0.4px;line-height:1.25;">
                ${title}
              </h1>
              
              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#8fb89b;">
                ${intro}
              </p>

              ${code ? `
              <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:14px;padding:22px 16px;text-align:center;margin:0 0 24px;">
                <div style="font-size:12px;font-weight:600;color:#5c8a6a;margin-bottom:8px;letter-spacing:0.5px;">YOUR VERIFICATION CODE</div>
                <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#4ade80;font-family:'Courier New',monospace;">
                  ${code}
                </div>
                <div style="font-size:12px;color:#5c8a6a;margin-top:10px;">Expires in 24 hours</div>
              </div>
              ` : ""}

              ${ctaUrl ? `
              <div style="text-align:center;margin:0 0 28px;">
                <a href="${ctaUrl}" 
                   style="display:inline-block;background:#4ade80;color:#060d08;font-weight:700;font-size:14px;
                          text-decoration:none;padding:14px 32px;border-radius:12px;
                          box-shadow:0 4px 14px rgba(74,222,128,0.25);">
                  ${ctaText || "Continue"}
                </a>
              </div>
              ` : ""}

              <p style="margin:0;font-size:13px;line-height:1.6;color:#5c8a6a;">
                ${footnote || "If you didn't request this, you can safely ignore this email."}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#080f0b;border-top:1px solid rgba(74,222,128,0.08);">
              <p style="margin:0;font-size:12px;color:#3d5c47;text-align:center;line-height:1.5;">
                SmartWaste · Jose Dalman, Zamboanga del Norte<br>
                <span style="color:#2d4635;">This is an automated message. Please do not reply.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, ...templateOpts }) {
  if (!transporter) {
    console.error("❌ Email transporter not configured. Email not sent.");
    throw new Error("Email service not configured (missing GMAIL_USER/GMAIL_APP_PASSWORD)");
  }

  return transporter.sendMail({
    from: `"SmartWaste" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: renderEmail(templateOpts)
  });
}

module.exports = { sendMail };