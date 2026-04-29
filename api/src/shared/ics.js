// Tiny iCalendar (RFC 5545) generator.
// Produces a single VCALENDAR with one VEVENT per checkout / approved reservation.
// Outlook (and Google, and Apple Calendar) can subscribe to this URL.

function buildIcs({ events, calendarName = "ECBC Truck", baseUrl = "" }) {
  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//East Coast Believers Church//ECBC Truck//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`);
  lines.push("X-WR-TIMEZONE:America/New_York");
  lines.push("X-PUBLISHED-TTL:PT1H");

  const now = formatDate(new Date());

  for (const ev of events) {
    if (!ev.start) continue;
    const uid = `${ev.id}@ecbc-truck`;
    const summary = ev.kind === "reservation"
      ? (ev.status === "approved" ? `Truck reserved: ${ev.who || "?"}` : `Truck (pending): ${ev.who || "?"}`)
      : `Truck checked out${ev.who ? ": " + ev.who : ""}`;

    const descParts = [];
    if (ev.who)    descParts.push(`Who: ${ev.who}`);
    if (ev.reason) descParts.push(`Reason: ${ev.reason}`);
    if (ev.kind)   descParts.push(`Type: ${ev.kind}`);
    if (ev.status) descParts.push(`Status: ${ev.status}`);
    if (baseUrl)   descParts.push(`More: ${baseUrl}`);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${formatDate(ev.start)}`);
    if (ev.end) {
      lines.push(`DTEND:${formatDate(ev.end)}`);
    } else {
      // Open-ended checkout; mark a 1-hour placeholder so the event renders.
      const placeholderEnd = new Date(new Date(ev.start).getTime() + 60 * 60 * 1000);
      lines.push(`DTEND:${formatDate(placeholderEnd)}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (descParts.length) lines.push(`DESCRIPTION:${escapeText(descParts.join("\\n"))}`);
    lines.push(`STATUS:${ev.status === "denied" ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  // YYYYMMDDTHHMMSSZ in UTC
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + "Z"
  );
}

function escapeText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

module.exports = { buildIcs };
