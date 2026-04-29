# ECBC Truck Reservations

A small Azure Static Web App that shows the ECBC Truck's check-in/check-out
calendar from AssetBots and lets people request a reservation. Each request
emails Jeremy Lynch with **Approve** / **Deny** buttons; clicking either
records the decision and notifies the requester. The page also exposes an
**iCalendar** feed at `/api/calendar` so anyone can subscribe to it from
Outlook, Google Calendar, or Apple Calendar.

---

## What's in this repo

```
ecbc-truck-reservations/
├── frontend/                 # static HTML/CSS/JS (FullCalendar)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── api/                      # Azure Functions (Node 18, programming model v4)
│   ├── package.json
│   ├── host.json
│   ├── local.settings.json.example
│   └── src/
│       ├── functions/
│       │   ├── checkouts.js   GET  /api/checkouts
│       │   ├── reserve.js     POST /api/reserve
│       │   ├── approve.js     GET  /api/approve
│       │   ├── deny.js        GET  /api/deny
│       │   └── calendar.js    GET  /api/calendar  (ICS feed)
│       └── shared/
│           ├── assetbots.js   AssetBots REST client
│           ├── storage.js     Azure Table Storage adapter
│           ├── email.js       SMTP sender (nodemailer)
│           ├── ics.js         iCalendar generator
│           └── decision-page.js  HTML confirmation page
├── staticwebapp.config.json  routing / headers
├── package.json              SWA CLI for local dev
└── .github/workflows/azure-static-web-apps.yml
```

---

## How the approval flow works

1. User opens the page, clicks **Request a Reservation**, fills in name, email,
   pick-up / return times, and reason.
2. `POST /api/reserve` saves a row in Azure Table Storage with
   `status = "pending"` and a random `approvalToken`.
3. The backend emails `jlynch@eastcoastbelievers.org` with two buttons:
   - **Approve** → `https://<your-site>/api/approve?id=...&token=...`
   - **Deny**    → `https://<your-site>/api/deny?id=...&token=...`
4. Clicking either button checks the token, flips the status, emails the
   requester, and shows Jeremy a confirmation page. Links are single-use:
   the second click shows "already decided".
5. Approved reservations appear on the calendar in blue; pending ones in
   amber; denied ones disappear.

---

## Environment variables

Set these as **Application Settings** on the Static Web App
(Configuration → Application settings) and as `Values.*` in
`api/local.settings.json` for local dev.

| Name | What it is |
|---|---|
| `ASSETBOTS_API_BASE` | Usually `https://api.assetbots.com` |
| `ASSETBOTS_API_KEY` | Bearer token from AssetBots |
| `ASSETBOTS_ASSET_ID` | The numeric/string ID of the ECBC Truck asset (see below) |
| `RESERVATIONS_TABLE_CONN` | Connection string for an Azure Storage account |
| `RESERVATIONS_TABLE_NAME` | Table name (default `TruckReservations`) |
| `APPROVER_EMAIL` | `jlynch@eastcoastbelievers.org` |
| `FROM_EMAIL` | The mailbox the approval emails come from |
| `FROM_NAME` | Display name (default `ECBC Truck`) |
| `SMTP_HOST` | e.g. `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` for STARTTLS on 587, `true` for SMTPS on 465 |
| `SMTP_USER` | mailbox login |
| `SMTP_PASS` | mailbox password (or app password) |
| `PUBLIC_BASE_URL` | The full public URL, e.g. `https://ecbc-truck.azurestaticapps.net` |
| `APPROVAL_TOKEN_SECRET` | (reserved for future use; any long random string is fine) |

Copy `api/local.settings.json.example` to `api/local.settings.json` and fill in
the same values to run locally.

---

## One-time setup

### 1. Get the AssetBots asset ID and API key

- In AssetBots, open the ECBC Truck asset and copy its ID from the URL.
- Generate an API token from your AssetBots account settings (Integrations →
  API Keys, or contact AssetBots support if you don't see this).

### 2. Create an Azure Storage account (for the reservations table)

```
az storage account create \
  --name ecbctruckstorage \
  --resource-group ecbc-truck-rg \
  --location eastus \
  --sku Standard_LRS

az storage account show-connection-string \
  --name ecbctruckstorage \
  --resource-group ecbc-truck-rg \
  --query connectionString -o tsv
```

Save that connection string — it goes into `RESERVATIONS_TABLE_CONN`.

The `TruckReservations` table is created automatically the first time a
reservation is submitted.

### 3. Set up email sending

The app uses plain SMTP (so you can plug in anything). Two easy options:

**Option A — Microsoft 365 mailbox (recommended for a church already on M365)**
- Use a real mailbox, e.g. `no-reply@eastcoastbelievers.org`.
- Enable SMTP AUTH for that mailbox: Microsoft 365 admin center → user →
  Mail → Manage email apps → Authenticated SMTP.
- The mailbox must have MFA disabled or use an *app password*.
- Set `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`.

**Option B — SendGrid**
- Create a free SendGrid account, verify the sender domain.
- Create an API key with "Mail Send" permission.
- Set `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=587`, `SMTP_USER=apikey`,
  `SMTP_PASS=<the API key>`.

### 4. Create the Static Web App and connect the repo

1. Push this folder to a new GitHub repo.
2. In the Azure portal: **Create a resource → Static Web App**.
3. Hosting plan: Standard (or Free, both work).
4. Source: GitHub → select your repo / branch.
5. Build presets: **Custom**.
   - App location: `frontend`
   - API location: `api`
   - Output location: *(leave empty)*
6. Azure auto-creates `.github/workflows/azure-static-web-apps-*.yml` and
   commits it. (You can delete the placeholder workflow file in this repo
   if you'd like — Azure's generated one supersedes it.)
7. After the first deploy, copy the public URL (`https://<name>.azurestaticapps.net`)
   into `PUBLIC_BASE_URL`.
8. Open **Configuration → Application settings** on the Static Web App and
   add every variable from the table above. Click **Save**. The Functions
   restart automatically.

### 5. Test the flow

- Open the public URL → calendar should render. If AssetBots data is empty,
  check the Function logs (Static Web App → Functions → checkouts → Logs).
- Click **Request a Reservation**, submit a test request from a personal email.
- Jeremy should get an email — click **Approve** — confirmation page renders,
  the requester gets the decision email, and the reservation flips from amber
  to blue on the calendar.
- Click **Subscribe in Outlook** in the header — Outlook on the web prompts
  to add the calendar by URL and starts polling `/api/calendar` hourly.

---

## Subscribing the calendar to Outlook

The **Subscribe in Outlook** button uses Outlook's `addfromweb` deep link with
the `/api/calendar` ICS feed URL. If that doesn't work for someone (e.g. they
use the Outlook desktop client), they can add it manually:

- **Outlook on the web** → Calendar → Add calendar → Subscribe from web →
  paste `https://<your-site>/api/calendar`.
- **Outlook desktop** → File → Account Settings → Internet Calendars → New →
  paste the same URL.

Outlook refreshes internet calendars roughly every few hours; the feed sets
a 5-minute Cache-Control header.

---

## Adjusting the AssetBots integration

The exact endpoint shape for AssetBots' REST API isn't broadly indexed, so
`api/src/shared/assetbots.js` tries several common patterns
(`/v1/assets/{id}/checkouts`, `/v1/assets/{id}/history`, etc.) and uses the
first one that returns data. If your AssetBots tenant uses a different path,
edit the `candidates` array in that file. The rest of the app only depends on
the normalized shape `{ id, start, end, who }` returned by `getAssetCheckouts`.

If your records use different field names for who has the truck or when it was
checked out, extend the lists in `normalize()` accordingly. The function is
intentionally permissive.

---

## Local development

```
npm install -g @azure/static-web-apps-cli azure-functions-core-tools@4
cd ecbc-truck-reservations/api && npm install && cd ..
cp api/local.settings.json.example api/local.settings.json
# edit api/local.settings.json with real values

swa start frontend --api-location api
```

Open <http://localhost:4280>. The SWA CLI proxies `/api/*` to the local
Functions host and serves the frontend.

---

## Security notes

- The page is public (anyone with the link can request a reservation).
- Approval links contain a 24-byte random token tied to a single reservation.
  After the first decision they're inert — the second click shows
  "already decided".
- Tokens never expire on a clock; if you want them to, add a check on
  `createdAt` in `approve.js`.
- The reservation table only stores name, email, time range, reason, and
  decision metadata. No payment info, no PII beyond that.
