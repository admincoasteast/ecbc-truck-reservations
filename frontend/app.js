// ECBC Truck Reservations - frontend
// Loads check-in/check-out history + approved reservations from /api/checkouts
// and lets the user request a new reservation via /api/reserve.

const COLORS = {
  checkout: getComputedStyle(document.documentElement).getPropertyValue("--color-checkout").trim() || "#c8531f",
  reserved: getComputedStyle(document.documentElement).getPropertyValue("--color-reserved").trim() || "#1f4e8c",
  pending:  getComputedStyle(document.documentElement).getPropertyValue("--color-pending").trim() || "#b58900",
};

let calendar;

document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
  initOutlookLink();
  initReserveModal();
});

function initCalendar() {
  const el = document.getElementById("calendar");
  calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listWeek",
    },
    height: "auto",
    eventDisplay: "block",
    nowIndicator: true,
    events: fetchEvents,
    eventDidMount: (info) => {
      // Tooltip via title attribute
      const e = info.event.extendedProps;
      const parts = [];
      if (e.kind === "checkout") parts.push("Checked out");
      else if (e.kind === "reservation") parts.push(e.status === "approved" ? "Approved reservation" : "Pending reservation");
      if (e.who)    parts.push(`By: ${e.who}`);
      if (e.reason) parts.push(`Reason: ${e.reason}`);
      info.el.title = parts.join("\n");
    },
  });
  calendar.render();
}

async function fetchEvents(_info, success, failure) {
  try {
    const resp = await fetch("/api/checkouts", { headers: { "Accept": "application/json" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const events = (data.events || []).map(toFullCalendarEvent);
    success(events);
  } catch (err) {
    showBanner("error", `Couldn't load calendar data: ${err.message}`);
    failure(err);
  }
}

function toFullCalendarEvent(ev) {
  let color = COLORS.checkout;
  if (ev.kind === "reservation") {
    color = ev.status === "approved" ? COLORS.reserved : COLORS.pending;
  }
  const titleBits = [];
  if (ev.who) titleBits.push(ev.who);
  if (ev.kind === "reservation" && ev.status === "pending") titleBits.push("(pending)");
  if (titleBits.length === 0) titleBits.push("Truck in use");

  return {
    title: titleBits.join(" "),
    start: ev.start,
    end: ev.end,
    allDay: !!ev.allDay,
    backgroundColor: color,
    borderColor: color,
    extendedProps: ev,
  };
}

function initOutlookLink() {
  // Microsoft's "Subscribe to calendar" deep link.
  // We point Outlook at our public ICS feed.
  const feedUrl = `${window.location.origin}/api/calendar`;
  const outlookSubscribeUrl =
    "https://outlook.office.com/calendar/0/addfromweb?url=" +
    encodeURIComponent(feedUrl) +
    "&name=" + encodeURIComponent("ECBC Truck");
  const link = document.getElementById("outlook-link");
  link.href = outlookSubscribeUrl;
}

function initReserveModal() {
  const modal = document.getElementById("reserve-modal");
  const openBtn = document.getElementById("reserve-btn");
  const closeBtn = document.getElementById("modal-close");
  const cancelBtn = document.getElementById("modal-cancel");
  const form = document.getElementById("reserve-form");
  const submitBtn = document.getElementById("submit-btn");
  const errorEl = document.getElementById("form-error");

  const open = () => { modal.hidden = false; };
  const close = () => {
    modal.hidden = true;
    errorEl.hidden = true;
    form.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Request";
  };

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const fd = new FormData(form);
    const payload = {
      requesterName: fd.get("requesterName"),
      requesterEmail: fd.get("requesterEmail"),
      startAt: fd.get("startAt"),
      endAt: fd.get("endAt"),
      reason: fd.get("reason"),
    };

    if (new Date(payload.endAt) <= new Date(payload.startAt)) {
      errorEl.textContent = "Return time must be after pick-up time.";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const resp = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || `HTTP ${resp.status}`);

      close();
      showBanner(
        "success",
        "Request sent! Jeremy will get an email with Approve / Deny buttons. " +
        "You'll be notified by email when he decides."
      );
      // Pull the pending reservation onto the calendar
      calendar.refetchEvents();
    } catch (err) {
      errorEl.textContent = `Couldn't send your request: ${err.message}`;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Request";
    }
  });
}

function showBanner(kind, message) {
  const banner = document.getElementById("status-banner");
  banner.className = `banner ${kind}`;
  banner.textContent = message;
  banner.hidden = false;
  if (kind !== "error") {
    setTimeout(() => { banner.hidden = true; }, 8000);
  }
}
