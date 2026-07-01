const wedding = require("../data/wedding.json");

const ALLOWED_EVENTS = new Set(["muhurtham", "evening"]);
const EVENT_ALIASES = {
  hightea: "evening",
  sangeet: "evening"
};
const RSVP_STATUSES = new Set(["attending", "declined"]);
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validatePhone(value) {
  const raw = cleanText(value, 30);
  const digits = normalizePhone(raw);
  if (raw.startsWith("+1") && digits.length === 11 && digits.startsWith("1") && !/^[01]/.test(digits.slice(1))) {
    return { phone: `+${digits}`, normalized: digits };
  }
  if (raw.startsWith("+91") && digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return { phone: `+${digits}`, normalized: digits };
  }
  return { error: "Please enter a valid US or India phone number." };
}

function validateLookupPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length === 11 && digits.startsWith("1") && !/^[01]/.test(digits.slice(1))) return digits;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return digits;
  return "";
}

function normalizeEvents(events) {
  return [...new Set(
    (Array.isArray(events) ? events : [])
      .map((event) => EVENT_ALIASES[event] || event)
      .filter((event) => ALLOWED_EVENTS.has(event))
  )];
}

function getEndpoint() {
  return process.env.RSVP_ENDPOINT || wedding.rsvpEndpoint || "";
}

function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(body);
}

function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return {};
}

function validateRsvp(input) {
  const phoneValidation = validatePhone(input.phone || input.whatsapp);
  const attending = normalizeEvents(input.attending);
  const rsvpStatus = RSVP_STATUSES.has(input.rsvpStatus) ? input.rsvpStatus : "attending";
  const guestCount = Number(input.guestCount);
  const rsvp = {
    name: cleanText(input.name, 120),
    phone: phoneValidation.phone || "",
    phoneNormalized: phoneValidation.normalized || "",
    originalPhoneNormalized: normalizePhone(input.originalPhone || input.originalWhatsapp),
    rsvpStatus,
    email: cleanText(input.email, 160).toLowerCase(),
    side: input.side === "bride" || input.side === "groom" ? input.side : "",
    attending: rsvpStatus === "declined" ? [] : attending,
    roomNights: [],
    guestCount: Number.isInteger(guestCount) ? guestCount : 0,
    song: cleanText(input.song, 500),
    code: cleanText(input.code, 80),
    submittedAt: cleanText(input.submittedAt, 40) || new Date().toISOString()
  };

  if (!rsvp.name) return { error: "Name is required." };
  if (phoneValidation.error) return { error: phoneValidation.error };
  if (!EMAIL_PATTERN.test(rsvp.email)) return { error: "A valid email is required." };
  if (!rsvp.side) return { error: "Please choose the bride or groom side." };
  if (rsvp.rsvpStatus === "attending" && !rsvp.attending.length) return { error: "Please choose at least one event." };
  if (rsvp.guestCount < 1 || rsvp.guestCount > 8) return { error: "Guest count must be between 1 and 8." };

  return { rsvp };
}

function normalizeUpstreamResult(result) {
  if (!result || !result.record) return result;
  const record = { ...result.record };
  record.phone = record.phone || record.whatsapp || "";
  record.attending = normalizeEvents(record.attending);
  delete record.whatsapp;
  delete record.whatsappNormalized;
  return { ...result, record };
}

async function readUpstream(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("The RSVP backend returned an invalid response.");
  }
}

module.exports = async function handler(request, response) {
  const endpoint = getEndpoint();
  if (!endpoint) {
    return sendJson(response, 503, {
      ok: false,
      code: "endpoint_not_configured",
      error: "The RSVP backend has not been configured."
    });
  }

  try {
    if (request.method === "GET") {
      const phone = Array.isArray(request.query.phone) ? request.query.phone[0] : request.query.phone;
      const normalized = validateLookupPhone(phone);
      if (!normalized) {
        return sendJson(response, 400, { ok: false, error: "Enter a valid US or India phone number." });
      }

      const url = new URL(endpoint);
      url.searchParams.set("action", "lookup");
      url.searchParams.set("phone", normalized);
      const upstream = await fetch(url, {
        headers: { Accept: "application/json" },
        redirect: "follow"
      });
      const result = await readUpstream(upstream);
      return sendJson(response, upstream.ok && result.ok !== false ? 200 : 502, normalizeUpstreamResult(result));
    }

    if (request.method === "POST") {
      const validation = validateRsvp(parseBody(request));
      if (validation.error) {
        return sendJson(response, 400, { ok: false, error: validation.error });
      }

      const rsvp = validation.rsvp;
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "upsert",
          ...rsvp,
          whatsapp: rsvp.phone,
          whatsappNormalized: rsvp.phoneNormalized,
          originalWhatsappNormalized: rsvp.originalPhoneNormalized
        }),
        redirect: "follow"
      });
      const result = await readUpstream(upstream);
      return sendJson(response, upstream.ok && result.ok !== false ? 200 : 502, normalizeUpstreamResult(result));
    }

    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("RSVP proxy error", error);
    return sendJson(response, 502, {
      ok: false,
      error: "The RSVP service is temporarily unavailable."
    });
  }
};
