const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Renders a small branded HTML email shell so every SmartWaste email
 * (verification, reset PIN, etc.) looks consistent.
 *
 * @param {Object} opts
 * @param {string} opts.eyebrow   Small label above the title, e.g. "Verify your email"
 * @param {string} opts.title     Big heading, e.g. "Confirm it's you"
 * @param {string} opts.intro     One or two sentences of body copy
 * @param {string} [opts.code]    Optional PIN/code to display in a big box
 * @param {string} [opts.ctaText] Optional button label
 * @param {string} [opts.ctaUrl]  Optional button link
 * @param {string} [opts.footnote] Small muted text at the bottom
 */
function renderEmail({ eyebrow, title, intro, code, ctaText, ctaUrl, footnote }) {
    return `
  <div style="background:#050b07;padding:32px 16px;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#0a1710;border:1px solid rgba(74,222,128,0.18);border-radius:16px;padding:32px 28px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
        <div style="width:34px;height:34px;background:#4ade80;border-radius:9px;display:inline-block;text-align:center;line-height:34px;font-weight:800;color:#060d08;font-size:15px;">S</div>
        <div style="font-weight:800;font-size:15px;letter-spacing:-0.02em;color:#4ade80;">SmartWaste</div>
      </div>

      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4ade80;margin-bottom:8px;">
        ${eyebrow}
      </div>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#e8f7ed;letter-spacing:-0.02em;">
        ${title}
      </h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#8fb89b;">
        ${intro}
      </p>

      ${code ? `
      <div style="font-size:30px;font-weight:800;letter-spacing:7px;color:#4ade80;text-align:center;padding:18px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);border-radius:12px;margin:0 0 20px;">
        ${code}
      </div>` : ""}

      ${ctaUrl ? `
      <div style="text-align:center;margin:0 0 20px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#4ade80;color:#060d08;font-weight:700;font-size:13px;letter-spacing:0.03em;text-decoration:none;padding:13px 28px;border-radius:10px;">
          ${ctaText || "Continue"}
        </a>
      </div>` : ""}

      <p style="margin:0;font-size:12px;line-height:1.6;color:#5c8a6a;">
        ${footnote || "If you didn't request this, you can safely ignore this email."}
      </p>
    </div>
    <p style="text-align:center;margin:18px 0 0;font-size:11px;color:#3d5c47;">
      SmartWaste · Jose Dalman, Zamboanga del Norte
    </p>
  </div>`;
}

async function sendMail({ to, subject, ...templateOpts }) {
    return transporter.sendMail({
        from: `"SmartWaste" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: renderEmail(templateOpts)
    });
}

module.exports = { transporter, sendMail };
