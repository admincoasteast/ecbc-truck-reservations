// GET /api/checkouts
// Returns AssetBots checkout history + our own reservations as a single
// list of normalized calendar events for the frontend.

const { app } = require("@azure/functions");
const { getAssetCheckouts } = require("../shared/assetbots");
const { listReservations } = require("../shared/storage");

app.http("checkouts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "checkouts",
  handler: async (request, context) => {
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

      return {
        status: 200,
        headers: { "Cache-Control": "no-store" },
        jsonBody: { events },
      };
    } catch (err) {
      context.log("checkouts handler error", err);
      return {
        status: 500,
        jsonBody: { error: err.message || "Internal error" },
      };
    }
  },
});

async function safe(fn, context, label) {
  try {
    return await fn();
  } catch (err) {
    context.log(`[${label}] failed:`, err.message);
    return [];
  }
}
