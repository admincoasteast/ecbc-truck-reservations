// GET /api/approve?id=...&token=...
// Recorded by clicking the Approve button in the email Jeremy receives.

const { app } = require("@azure/functions");
const { getReservation, decideReservation } = require("../shared/storage");
const { sendDecisionToRequester } = require("../shared/email");
const { renderDecisionPage } = require("../shared/decision-page");

app.http("approve", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "approve",
  handler: async (request, context) => handleDecision(request, context, "approved"),
});

async function handleDecision(request, context, decision) {
  const id = request.query.get("id");
  const token = request.query.get("token");

  if (!id || !token) {
    return htmlResponse(400, renderDecisionPage({
      heading: "Missing link parameters",
      body: "This approval link is incomplete. Please use the buttons in the email.",
      kind: "error",
    }));
  }

  try {
    const existing = await getReservation(id);
    if (!existing) {
      return htmlResponse(404, renderDecisionPage({
        heading: "Reservation not found",
        body: "We couldn't find that reservation. It may have been deleted.",
        kind: "error",
      }));
    }
    if (existing.approvalToken !== token) {
      return htmlResponse(403, renderDecisionPage({
        heading: "Invalid or expired link",
        body: "This approval link is no longer valid.",
        kind: "error",
      }));
    }
    if (existing.status !== "pending") {
      return htmlResponse(200, renderDecisionPage({
        heading: "Already decided",
        body: `This reservation was already ${existing.status} on ${formatWhen(existing.decidedAt)}.`,
        kind: "info",
        reservation: existing,
      }));
    }

    const updated = await decideReservation(id, decision, {
      decidedBy: process.env.APPROVER_EMAIL,
    });

    try {
      await sendDecisionToRequester(updated);
    } catch (err) {
      context.log("notify requester failed", err);
      // Still show success to approver
    }

    const heading = decision === "approved" ? "Approved" : "Denied";
    const body = decision === "approved"
      ? `Reservation approved. ${updated.requesterName} has been notified by email.`
      : `Reservation denied. ${updated.requesterName} has been notified by email.`;
    return htmlResponse(200, renderDecisionPage({
      heading,
      body,
      kind: decision === "approved" ? "success" : "warn",
      reservation: updated,
    }));
  } catch (err) {
    context.log("approve handler error", err);
    return htmlResponse(500, renderDecisionPage({
      heading: "Something went wrong",
      body: err.message || "Internal error",
      kind: "error",
    }));
  }
}

function htmlResponse(status, html) {
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: html,
  };
}

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" });
}

module.exports.handleDecision = handleDecision;
