// AssetBots API client.
//
// AssetBots' public REST docs aren't broadly indexed, so the exact endpoint
// shapes here are best-guesses based on the platform's UI vocabulary
// (assets, checkouts, history). If your tenant's API differs, adjust
// `getAssetCheckouts` below — the rest of the app only depends on the
// normalized shape it returns.
//
// Normalized shape returned by getAssetCheckouts:
//   [{ id, start, end, who, source: "assetbots" }]
// `end` may be null while a checkout is still open.

const API_BASE = process.env.ASSETBOTS_API_BASE || "https://api.assetbots.com";
const API_KEY = process.env.ASSETBOTS_API_KEY;
const ASSET_ID = process.env.ASSETBOTS_ASSET_ID;

function authHeaders() {
  if (!API_KEY) throw new Error("ASSETBOTS_API_KEY is not set");
  return {
    "Authorization": `Bearer ${API_KEY}`,
    "Accept": "application/json",
    "User-Agent": "ECBC-Truck-Page/1.0",
  };
}

async function tryFetch(url) {
  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`AssetBots ${resp.status} on ${url}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

// Try a few common endpoint shapes. Return the first that works.
async function getAssetCheckouts() {
  if (!ASSET_ID) throw new Error("ASSETBOTS_ASSET_ID is not set");

  const candidates = [
    `${API_BASE}/v1/assets/${encodeURIComponent(ASSET_ID)}/checkouts`,
    `${API_BASE}/assets/${encodeURIComponent(ASSET_ID)}/checkouts`,
    `${API_BASE}/v1/checkouts?assetId=${encodeURIComponent(ASSET_ID)}`,
    `${API_BASE}/checkouts?assetId=${encodeURIComponent(ASSET_ID)}`,
    `${API_BASE}/v1/assets/${encodeURIComponent(ASSET_ID)}/history`,
    `${API_BASE}/assets/${encodeURIComponent(ASSET_ID)}/history`,
  ];

  let lastErr;
  for (const url of candidates) {
    try {
      const data = await tryFetch(url);
      const list = pickList(data);
      if (Array.isArray(list)) {
        return list.map(normalize).filter(Boolean);
      }
    } catch (err) {
      lastErr = err;
      // Keep trying other candidates on 404 / 405; bail on auth errors.
      if (err.status === 401 || err.status === 403) throw err;
    }
  }
  throw lastErr || new Error("No AssetBots checkout endpoint matched");
}

// Most REST APIs return either an array directly or { data: [...] }
// or { items: [...] } or { results: [...] }.
function pickList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["data", "items", "results", "checkouts", "history", "events"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return null;
}

// Normalize a single record. Be permissive about field names because
// every asset-tracking API spells these slightly differently.
function normalize(record) {
  if (!record || typeof record !== "object") return null;

  const start =
    record.checkedOutAt || record.checkoutAt || record.checkedOutOn ||
    record.startsAt || record.startAt || record.startDate ||
    record.start || record.createdAt;

  const end =
    record.checkedInAt || record.checkinAt || record.returnedAt ||
    record.endsAt || record.endAt || record.endDate || record.end || null;

  if (!start) return null;

  // "Who" can be a person object, a name string, or a location.
  let who = null;
  const candidate =
    record.checkedOutTo || record.assignedTo || record.assignee ||
    record.user || record.person || record.holder || record.location;

  if (candidate) {
    if (typeof candidate === "string") who = candidate;
    else if (candidate.name) who = candidate.name;
    else if (candidate.fullName) who = candidate.fullName;
    else if (candidate.firstName || candidate.lastName) {
      who = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ");
    } else if (candidate.email) who = candidate.email;
  }

  return {
    id: String(record.id || record._id || record.checkoutId || cryptoRandomId()),
    start: new Date(start).toISOString(),
    end: end ? new Date(end).toISOString() : null,
    who,
    source: "assetbots",
  };
}

function cryptoRandomId() {
  return "ck_" + Math.random().toString(36).slice(2, 10);
}

module.exports = { getAssetCheckouts };
