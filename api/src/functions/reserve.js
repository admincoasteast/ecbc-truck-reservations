// POST /api/reserve
// Body: { requesterName, requesterEmail, startAt, endAt, reason }
// Creates a pending reservation, emails the approver with Approve/Deny links.

const { app } = require("@azure/functions");
const { createReservation } = require("../shared/storage");
const { sendApprovalRequest } = require("../shared/email");

app.http("reserve", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "reserve",
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const errors = validate(body);
    if (errors.length) {
      return { status: 400, jsonBody: { error: errors.join("; ") } };
    }

    try {
      const reservation = await createReservation({
        requesterName: body.requesterName.trim(),
        requesterEmail: body.requesterEmail.trim(),
        reason: body.reason.trim(),
        startAt: body.startAt,
        endAt: body.endAt,
      });

      try {
        await sendApprovalRequest(reservation);
      } catch (mailErr) {
        context.log("email send failed", mailErr);
        return {
          status: 502,
          jsonBody: {
            error: "Reservation saved, but the approval email failed to send. Please contact the office.",
          },
        };
      }

      return {
        status: 201,
        jsonBody: {
          ok: true,
          id: reservation.rowKey,
          status: reservation.status,
        },
      };
    } catch (err) {
      context.log("reserve handler error", err);
      return { status: 500, jsonBody: { error: err.message || "Internal error" } };
    }
  },
});

function validate(b) {
  const errors = [];
  if (!b || typeof b !== "object") return ["Missing body"];
  if (!nonEmpty(b.requesterName, 120)) errors.push("requesterName required");
  if (!nonEmpty(b.requesterEmail, 240) || !/^\S+@\S+\.\S+$/.test(b.requesterEmail)) errors.push("valid requesterEmail required");
  if (!nonEmpty(b.reason, 1000)) errors.push("reason required");
  const start = Date.parse(b.startAt);
  const end   = Date.parse(b.endAt);
  if (!start) errors.push("startAt required");
  if (!end)   errors.push("endAt required");
  if (start && end && end <= start) errors.push("endAt must be after startAt");
  if (start && start < Date.now() - 24 * 60 * 60 * 1000) errors.push("startAt cannot be in the past");
  return errors;
}

function nonEmpty(v, max) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}
