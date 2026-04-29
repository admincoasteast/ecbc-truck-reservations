// GET /api/calendar
// Returns an iCalendar feed (text/calendar) of checkouts + approved reservations
// so users can subscribe to it in Outlook, Google, or Apple Calendar.

const { app } = require("@azure/functions");
const { getAssetCheckouts } = require("../shared/assetbots");
const { listReservations } = require("../shared/storage");
const { buildIcs } = require("../shared/ics");

app.http("calendar", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "calendar",
  handler: async (_request, context) => {
    try {
      const [checkouts, reservations] = await Promise.all([
        safe(() => getAssetCheckouts(), context, "assetbots"),
        safe(() => listReservations(), context, "storage"),
      ]);

      const events = [];

      for (const c of checkouts || []) {
        events.push({
          id: `assetbots:${c.id}`,
          kind: "checkout",
          start: c.start,
          end: c.end,
          who: c.who,
        });
      }

      for (const r of reservations || []) {
        if (r.status === "denied") continue;
        events.push({
          id: `res:${r.rowKey}`,
          kind: "reservation",
          status: r.status,
          start: r.startAt,
          end: r.endAt,
          who: r.requesterName,
          reason: r.reason,
        });
      }

      const ics = buildIcs({
        events,
        calendarName: "ECBC Truck",
        baseUrl: process.env.PUBLIC_BASE_URL || "",
      });

      return {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'inline; filename="ecbc-truck.ics"',
          "Cache-Control": "public, max-age=300",
        },
        body: ics,
      };
    } catch (err) {
      context.log("calendar handler error", err);
      return { status: 500, body: "Internal error" };
    }
  },
});

async function safe(fn, context, label) {
  try { return await fn(); }
  catch (err) { context.log(`[${label}] failed:`, err.message); return []; }
}
