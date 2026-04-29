// Azure Table Storage adapter for reservation records.
//
// Schema: one table (default name TruckReservations).
//   PartitionKey = "ECBC-TRUCK"  (single asset for now)
//   RowKey       = reservation id (uuid-ish)
//   Properties:
//     requesterName, requesterEmail, reason
//     startAt, endAt        (ISO strings)
//     status                "pending" | "approved" | "denied"
//     approvalToken         random opaque string
//     createdAt, decidedAt  (ISO strings)
//     decidedBy             approver email at time of decision
//     decisionReason        optional note from approver

const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const crypto = require("crypto");

const PARTITION = "ECBC-TRUCK";

let _client = null;

function getClient() {
  if (_client) return _client;
  const conn = process.env.RESERVATIONS_TABLE_CONN;
  const tableName = process.env.RESERVATIONS_TABLE_NAME || "TruckReservations";
  if (!conn) throw new Error("RESERVATIONS_TABLE_CONN is not set");
  _client = TableClient.fromConnectionString(conn, tableName, {
    allowInsecureConnection: conn.includes("UseDevelopmentStorage=true"),
  });
  return _client;
}

async function ensureTable() {
  const client = getClient();
  try {
    await client.createTable();
  } catch (err) {
    // Already exists is fine.
    if (err.statusCode !== 409) throw err;
  }
}

async function createReservation({ requesterName, requesterEmail, reason, startAt, endAt }) {
  await ensureTable();
  const id = newId();
  const approvalToken = crypto.randomBytes(24).toString("base64url");
  const entity = {
    partitionKey: PARTITION,
    rowKey: id,
    requesterName,
    requesterEmail,
    reason,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    status: "pending",
    approvalToken,
    createdAt: new Date().toISOString(),
  };
  await getClient().createEntity(entity);
  return entity;
}

async function getReservation(id) {
  try {
    return await getClient().getEntity(PARTITION, id);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function decideReservation(id, decision, { decidedBy, decisionReason } = {}) {
  if (decision !== "approved" && decision !== "denied") {
    throw new Error("Invalid decision");
  }
  const existing = await getReservation(id);
  if (!existing) return null;
  if (existing.status !== "pending") {
    return existing; // idempotent: already decided, return as-is
  }
  const update = {
    partitionKey: PARTITION,
    rowKey: id,
    status: decision,
    decidedAt: new Date().toISOString(),
    decidedBy: decidedBy || null,
    decisionReason: decisionReason || null,
  };
  await getClient().updateEntity(update, "Merge");
  return { ...existing, ...update };
}

async function listReservations() {
  await ensureTable();
  const out = [];
  const iter = getClient().listEntities({
    queryOptions: { filter: `PartitionKey eq '${PARTITION}'` },
  });
  for await (const e of iter) {
    out.push(e);
  }
  return out;
}

function newId() {
  // Time-prefixed so they sort nicely in the portal
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString("base64url");
  return `${ts}-${rand}`;
}

module.exports = {
  createReservation,
  getReservation,
  decideReservation,
  listReservations,
};
