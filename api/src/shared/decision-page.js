// Renders a small confirmation HTML page shown to the approver after they
// click Approve or Deny in the email.

function renderDecisionPage({ heading, body, kind = "info", reservation = null }) {
  const colors = {
    success: { bg: "#e6f4ea", border: "#b8dec0", fg: "#1d5d2c" },
    warn:    { bg: "#fff3df", border: "#ecd397", fg: "#7a5108" },
    info:    { bg: "#e6effa", border: "#b9cce6", fg: "#133b73" },
    error:   { bg: "#fde7e7", border: "#f1b6b6", fg: "#8a1818" },
  }[kind] || { bg: "#eef2f7", border: "#cdd6e0", fg: "#1c2330" };

  const detailRows = reservation ? `
    <table style="border-collapse:collapse; margin:16px 0; width:100%;">
      <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Requester</td><td>${esc(reservation.requesterName)} &lt;${esc(reservation.requesterEmail)}&gt;</td></tr>
      <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Pick-up</td><td>${esc(formatWhen(reservation.startAt))}</td></tr>
      <tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Return</td><td>${esc(formatWhen(reservation.endAt))}</td></tr>
      <tr><td style="padding:4px 16px 4px 0; color:#5b6878; vertical-align:top;">Reason</td><td style="white-space:pre-wrap;">${esc(reservation.reason)}</td></tr>
      ${reservation.status ? `<tr><td style="padding:4px 16px 4px 0; color:#5b6878;">Status</td><td><strong>${esc(reservation.status)}</strong></td></tr>` : ""}
    </table>` : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${esc(heading)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f7f9fc; color:#1c2330; padding:32px; }
  .card { max-width:560px; margin:0 auto; background:white; border-radius:12px; box-shadow:0 4px 16px rgba(20,30,50,.08); padding:32px; }
  .pill { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:600;
          background:${colors.bg}; color:${colors.fg}; border:1px solid ${colors.border}; }
  h1 { margin:8px 0 4px; font-size:24px; }
  p  { color:#5b6878; }
  td { padding:4px 0; vertical-align:top; }
</style></head>
<body><div class="card">
  <span class="pill">${esc(kind)}</span>
  <h1>${esc(heading)}</h1>
  <p>${esc(body)}</p>
  ${detailRows}
</div></body></html>`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"; }
  catch { return String(iso); }
}

module.exports = { renderDecisionPage };
