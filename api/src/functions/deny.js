// GET /api/deny?id=...&token=...

const { app } = require("@azure/functions");
const { handleDecision } = require("./approve");

app.http("deny", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "deny",
  handler: async (request, context) => handleDecision(request, context, "denied"),
});
