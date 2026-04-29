// SMTP-based email sender. Works with Microsoft 365, SendGrid, Mailgun,
// Amazon SES — anything that speaks SMTP.

const nodemailer = require("nodemailer");

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST / SMTP_USER / SMTP_PASS must be set");
  }
  _transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });
  return _transporter;
}

function fromAddress() {
  const addr = process.env.FROM_EMAIL;
  const name = process.env.FROM_NAME || "ECBC Truck";
  if (!addr) throw new Error("FROM_EMAIL is not set");
  return `"${name}" <${addr}>`;
}

async function sendApprovalRequest(reservation) {
  const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const approveUrl = `${baseUrl}/api/approve?id=${encodeURIComponent(reservation.rowKey)}&token=${encodeURIComponent(reservation.approvalToken)}`;
  const denyUrl    = `${baseUrl}/api/deny?id=${encodeURIComponent(reservation.rowKey)}&token=${encodeURIComponent(reservation.approvalToken)}`;

  const start = formatWhen(reservation.startAt);
  const end   = formatWhen(reservation.endAt);

  const text = [
    `New ECBC Truck reservation request`,
    ``,
    `Requester: ${reservation.requesterName} <${reservation.requesterEmail}>`,
    `When: ${start} → ${end}`,
    `Reason: ${reservation.reason}`,
    ``,
    `Approve: ${approveUrl}`,
    `Deny:    ${denyUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1c2330; max-width:560px;">
      <h2 style="margin-bottom:4px;">ECBC Truck — Reservation Request</h2>
      <p style="color:#5b6878; margin-top:0;">Click a button below to approve or deny.</p>
      <table style="border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Requester</td><td style="padding:4px 0;"><strong>${escapeHtml(reservation.requesterName)}</strong> &lt;${escapeHtml(reservation.requesterEmail)}&gt;</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Pick-up</td><td style="padding:4px 0;">${escapeHtml(start)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Return</td><td style="padding:4px 0;">${escapeHtml(end)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#5b6878; vertical-align:top;">Reason</td><td style="padding:4px 0; white-space:pre-wrap;">${escapeHtml(reservation.reason)}</td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${approveUrl}" style="background:#1d7a3a; color:white; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:8px;">Approve</a>
        <a href="${denyUrl}" style="background:#a92424; color:white; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600;">Deny</a>
      </p>
      <p style="color:#5b6878; font-size:12px;">
        These links are unique to this request. They become inactive after you make a decision.
      </p>
    </div>
  `;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: process.env.APPROVER_EMAIL,
    replyTo: reservation.requesterEmail,
    subject: `Truck request from ${reservation.requesterName} — ${start}`,
    text,
    html,
  });
}

async function sendDecisionToRequester(reservation) {
  const start = formatWhen(reservation.startAt);
  const end   = formatWhen(reservation.endAt);
  const approved = reservation.status === "approved";
  const subject = approved
    ? `Approved: ECBC Truck for ${start}`
    : `Denied: ECBC Truck for ${start}`;
  const text = approved
    ? `Your ECBC Truck reservation has been approved.\n\nWhen: ${start} → ${end}\nReason: ${reservation.reason}\n\nThanks!`
    : `Your ECBC Truck reservation request was denied.\n\nWhen: ${start} → ${end}\nReason: ${reservation.reason}\n\nIf you have questions, reply to this email.`;

  await getTransporter().sendMail({
    from: fromAddress(),
    to: reservation.requesterEmail,
    replyTo: process.env.APPROVER_EMAIL,
    subject,
    text,
  });
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = { sendApprovalRequest, sendDecisionToRequester };
