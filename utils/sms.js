/**
 * IPROG SMS utility
 * Docs: https://sms.iprogtech.com/api/v1/documentation
 *
 * Env: IPROG_API_TOKEN
 */
const IPROG_API_TOKEN = process.env.IPROG_API_TOKEN;
const IPROG_BASE = "https://sms.iprogtech.com/api/v1";

function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[\s\-\(\)]/g, "");
    if (p.startsWith("+63")) p = "0" + p.slice(3);
    if (p.startsWith("63") && p.length === 12) p = "0" + p.slice(2);
    if (/^9\d{9}$/.test(p)) p = "0" + p;
    if (!/^09\d{9}$/.test(p)) return null;
    return p;
}

async function sendSMS(phone, message) {
    if (!IPROG_API_TOKEN) {
        console.error("❌ IPROG_API_TOKEN is not set in .env");
        return { ok: false, error: "SMS not configured" };
    }

    const phone_number = normalizePhone(phone);
    if (!phone_number) {
        return { ok: false, error: "Invalid Philippine phone number" };
    }

    try {
        const res = await fetch(`${IPROG_BASE}/sms_messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_token: IPROG_API_TOKEN,
                phone_number,
                message: String(message).slice(0, 300),
            }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && (data.status === 200 || data.status === "success" || data.message_id)) {
            console.log(`📱 SMS sent to ${phone_number} — id: ${data.message_id || "ok"}`);
            return { ok: true, data };
        }

        console.error("IPROG SMS error:", data);
        return { ok: false, error: data.message || data.error || "SMS send failed", data };
    } catch (err) {
        console.error("IPROG SMS network error:", err.message);
        return { ok: false, error: err.message };
    }
}

async function sendOTP(phone, code, purpose = "verification") {
    const msg =
        purpose === "reset"
            ? `SmartWaste: Your password reset code is ${code}. Valid for 15 minutes. Do not share this code.`
            : `SmartWaste: Your verification code is ${code}. Valid for 24 hours. Do not share this code.`;
    return sendSMS(phone, msg);
}

async function sendPickupNotice(phone, { zoneName, plateNumber, pickupType } = {}) {
    const zone = zoneName ? ` (${zoneName})` : "";
    const truck = plateNumber ? ` Truck: ${plateNumber}.` : "";
    const type = pickupType && pickupType !== "regular" ? ` Type: ${pickupType}.` : "";
    const msg = `SmartWaste: Trash collection is scheduled TODAY${zone}.${truck}${type} Please put out your garbage. - MENRO Jose Dalman`;
    return sendSMS(phone, msg);
}

module.exports = {
    sendSMS,
    sendOTP,
    sendPickupNotice,
    normalizePhone,
};