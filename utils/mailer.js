const nodemailer = require("nodemailer");
const dns = require("dns");
require("dotenv").config();

// ===========================================================
// SMTP transporter — reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
// from your .env (Gmail SMTP in your case).
//
// NOTE on SMTP_PASS: Gmail requires a 16-character "App Password",
// not your normal Gmail login password. Generate one at
// https://myaccount.google.com/apppasswords (requires 2-Step Verification
// to be turned on for the Google account). Paste it into .env with no
// spaces, e.g. SMTP_PASS=abcdefghijklmnop
// ===========================================================

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || `SmartWaste <${SMTP_USER}>`;

let transporter = null;

// Some Railway builds keep resolving smtp.gmail.com to an IPv6 address
// (AAAA record) that isn't actually routable from the container, no matter
// what `family`/`dns.setDefaultResultOrder` hints are given — those are
// requests, not guarantees, and this runtime isn't honoring them. So instead
// we resolve the hostname to a real IPv4 address ourselves with
// dns.promises.lookup(..., { family: 4 }) and connect directly to that IP,
// setting `tls.servername` to the original hostname so the TLS certificate
// (issued for smtp.gmail.com) still validates correctly.
async function resolveIPv4(hostname) {
  const { address } = await dns.promises.lookup(hostname, { family: 4 });
  return address;
}

async function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error(
      "❌ Mailer not configured — missing SMTP_HOST / SMTP_USER / SMTP_PASS in .env"
    );
    return null;
  }

  let connectHost = SMTP_HOST;
  try {
    connectHost = await resolveIPv4(SMTP_HOST);
    console.log(`📮 Resolved ${SMTP_HOST} → ${connectHost} (IPv4)`);
  } catch (err) {
    console.error(`⚠️ Could not resolve an IPv4 address for ${SMTP_HOST}, falling back to hostname:`, err.message);
  }

  transporter = nodemailer.createTransport({
    host: connectHost,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    family: 4,
    connectionTimeout: 10000, // time to establish the TCP connection
    greetingTimeout: 10000,   // time to wait for the SMTP greeting
    socketTimeout: 15000,     // time to wait on an idle socket
    tls: {
      // Required because we're connecting by IP, not hostname — this
      // tells Node which hostname to validate Gmail's TLS cert against.
      servername: SMTP_HOST
    }
  });

  return transporter;
}

// Verify SMTP credentials once at startup so misconfiguration shows up
// immediately in the logs instead of silently failing on first send.
async function verifyMailer() {
  const t = await getTransporter();
  if (!t) return;
  t.verify((err) => {
    if (err) {
      console.error("❌ SMTP connection failed:", err.message);
    } else {
      console.log(`✅ SMTP ready — sending as ${SMTP_USER}`);
    }
  });
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Shared branded HTML template for verification / reset emails.
function buildHtml({ eyebrow, title, intro, code, ctaText, ctaUrl }) {
  return `
  <div style="background:#f4f6f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e8e7;">
      <div style="background:#1f8a5f;padding:20px 28px;">
        <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">
          ${escapeHtml(eyebrow || "SmartWaste")}
        </span>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${escapeHtml(title || "")}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(intro || "")}</p>

        ${code
      ? `<div style="margin:0 0 20px;text-align:center;">
                 <span style="display:inline-block;padding:14px 28px;background:#f0fdf4;border:1px dashed #1f8a5f;border-radius:10px;font-size:28px;letter-spacing:.3em;font-weight:700;color:#166534;">
                   ${escapeHtml(code)}
                 </span>
               </div>`
      : ""
    }

        ${ctaUrl
      ? `<div style="margin:0 0 20px;text-align:center;">
                 <a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;background:#1f8a5f;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
                   ${escapeHtml(ctaText || "Continue")}
                 </a>
               </div>`
      : ""
    }

        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e8e7;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">SmartWaste · Jose Dalman, Zamboanga del Norte</p>
      </div>
    </div>
  </div>`;
}

/**
 * sendMail({ to, subject, eyebrow, title, intro, code, ctaText, ctaUrl })
 * Throws on failure so callers can decide whether to fail the request
 * or just log it (see resendVerification for a "log but don't fail" example).
 */
async function sendMail({ to, subject, eyebrow, title, intro, code, ctaText, ctaUrl }) {
  const t = await getTransporter();
  if (!t) {
    throw new Error("Mailer not configured — check SMTP_HOST/SMTP_USER/SMTP_PASS in .env");
  }

  const html = buildHtml({ eyebrow, title, intro, code, ctaText, ctaUrl });
  const textFallback = [intro, code ? `Code: ${code}` : "", ctaUrl ? `Link: ${ctaUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const info = await t.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text: textFallback,
    html
  });

  console.log(`📧 Mail sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendMail, verifyMailer };