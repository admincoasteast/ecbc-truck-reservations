// AssetBots API client.
//
// AssetBots' API only exposes the asset's CURRENT checkout state via
// GET /v1/assets/{id}. There is no list-historical-checkouts endpoint
// (GET /v1/checkouts returns 405). So this client returns at most one
// event — the current open checkout, if any.
//
// Past checkouts can be tracked over time by the calling app caching
// state transitions, but that's not implemented here.
//
// Normalized shape returned by getAssetCheckouts:
//   [{ id, start, end, who, source: "assetbots" }]
// `end` is null while a checkout is still open.

const API_BASE = (process.env.ASSETBOTS_API_BASE || "https://api.assetbots.com").replace(/\/$/, "");
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

async function getAssetCheckouts() {
  if (!ASSET_ID) throw new Error("ASSETBOTS_ASSET_ID is not set");

  const url = `${API_BASE}/v1/assets/${encodeURIComponent(ASSET_ID)}`;
  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`AssetBots ${resp.status} on ${url}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  const payload = await resp.json();
  // /v1/assets/{id} returns { data: [ {asset...} ] } even for a single id.
  const asset = (payload.data && payload.data[0]) || payload.data || payload;
  if (!asset) return [];

  const co = asset.checkout;
  if (!co || !co.value) return []; // currently checked in

  const start = co.value.date || co.value.checkoutDate || co.value.startDate;
  if (!start) return [];

  let who = null;
  const target = co.value.person || co.value.location || co.value.user;
  if (target) {
    if (typeof target === "string") who = target;
    else if (target.name) who = target.name;
    else if (target.fullName) who = target.fullName;
    else if (target.firstName || target.lastName) {
      who = [target.firstName, target.lastName].filter(Boolean).join(" ");
    } else if (target.value && target.value.name) who = target.value.name;
  }

  return [{
    id: String(co.id || asset.id),
    start: new Date(start).toISOString(),
    end: null, // open checkout
    who,
    source: "assetbots",
  }];
}

module.exports = { getAssetCheckouts };
