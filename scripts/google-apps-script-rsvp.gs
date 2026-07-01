const SPREADSHEET_ID = "PASTE_GOOGLE_SHEET_ID_HERE";
const SHEET_NAME = "RSVP";
const HEADERS = [
  "submittedAt",
  "updatedAt",
  "name",
  "phone",
  "phoneNormalized",
  "email",
  "side",
  "attending",
  "guestCount",
  "song",
  "code",
  "rsvpStatus",
  "roomNights"
];

const EVENT_DETAILS = {
  muhurtham: "Wedding & Muhurtham - Sunday, August 16, 2026 at 9:30 AM onwards",
  evening: "Evening Celebration - Sunday, August 16, 2026 at 5:00 PM"
};

const EVENT_ALIASES = {
  hightea: "evening",
  sangeet: "evening"
};

const VENUE_NAME = "Trillium Nursery Farm";
const VENUE_ADDRESS = "Redmond, WA 98053";
const SITE_URL = "https://akshwin-together.vercel.app";
const EMAIL_HERO_URL = SITE_URL + "/assets/images/sticker-couple.png";
const EMAIL_CTA_LABEL = "See the celebration";
const EMAIL_EDIT_RSVP_LABEL = "Edit your RSVP";
const EMAIL_CALENDAR_LABEL = "Add to calendar";

function doGet(e) {
  try {
    const phone = normalizePhone_(e.parameter.phone);
    if ((e.parameter.action || "") !== "lookup" || phone.length < 7) {
      return json_({ ok: false, error: "A valid lookup phone number is required." });
    }

    const sheet = getSheet_();
    const match = findByPhone_(sheet, phone);
    if (!match) return json_({ ok: true, found: false });

    return json_({ ok: true, found: true, record: rowToRecord_(sheet, match.row) });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    const phone = normalizePhone_(body.phoneNormalized || body.phone || body.whatsappNormalized || body.whatsapp);
    if (phone.length < 7) return json_({ ok: false, error: "A valid phone number is required." });

    const sheet = getSheet_();
    const originalPhone = normalizePhone_(body.originalPhoneNormalized || body.originalWhatsappNormalized) || phone;
    const match = findByPhone_(sheet, originalPhone);
    const duplicate = originalPhone !== phone ? findByPhone_(sheet, phone) : null;
    if (duplicate && (!match || duplicate.row !== match.row)) {
      return json_({ ok: false, error: "That phone number is already linked to another RSVP." });
    }
    const now = new Date().toISOString();
    const attending = normalizeEvents_(body.attending || []);
    const submittedAt = match
      ? sheet.getRange(match.row, 1).getDisplayValue() || now
      : body.submittedAt || now;
    const values = [[
      safeText_(submittedAt),
      now,
      safeText_(body.name),
      safeText_(body.phone || body.whatsapp),
      phone,
      safeText_(body.email),
      safeText_(body.side),
      safeText_(attending.join(", ")),
      Number(body.guestCount || 1),
      safeText_(body.song),
      safeText_(body.code),
      safeText_(body.rsvpStatus || (attending.length ? "attending" : "declined")),
      ""
    ]];

    let row;
    let action;
    if (match) {
      row = match.row;
      action = "updated";
      sheet.getRange(row, 1, 1, HEADERS.length).setValues(values);
    } else {
      action = "created";
      sheet.appendRow(values[0]);
      row = sheet.getLastRow();
    }

    const record = rowToRecord_(sheet, row);
    const email = sendConfirmationEmail_(record, action);
    return json_({ ok: true, action, email, record });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const width = Math.max(sheet.getLastColumn(), HEADERS.length);
    let currentHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
    while (currentHeaders.length && !currentHeaders[currentHeaders.length - 1]) currentHeaders.pop();
    if (currentHeaders[3] === "whatsapp") currentHeaders[3] = "phone";
    if (currentHeaders[4] === "whatsappNormalized") currentHeaders[4] = "phoneNormalized";
    HEADERS.forEach((header) => {
      if (currentHeaders.indexOf(header) === -1) currentHeaders.push(header);
    });
    sheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
  }
  return sheet;
}

function findByPhone_(sheet, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const rowPhone = normalizePhone_(values[index][4] || values[index][3]);
    if (rowPhone === phone) return { row: index + 2 };
  }
  return null;
}

function rowToRecord_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  return {
    submittedAt: values[0],
    updatedAt: values[1],
    name: values[2],
    phone: values[3],
    email: values[5],
    side: values[6],
    attending: normalizeEvents_(values[7] ? values[7].split(",").map((value) => value.trim()).filter(Boolean) : []),
    guestCount: Number(values[8] || 1),
    song: values[9],
    code: values[10],
    rsvpStatus: values[11] || (values[7] ? "attending" : "declined"),
    roomNights: values[12] ? values[12].split(",").map((value) => value.trim()).filter(Boolean) : []
  };
}

function sendConfirmationEmail_(record, action) {
  if (!record.email) return { sent: false, reason: "missing_email" };

  const attending = (record.rsvpStatus || "") !== "declined" && record.attending.length > 0;
  const subject = attending
    ? "Your RSVP is confirmed for Ashwin & Akshata's wedding"
    : "Thank you for your RSVP - Ashwin & Akshata";
  const events = record.attending
    .map((id) => EVENT_DETAILS[id] || id)
    .join("\n");
  const firstName = String(record.name || "there").split(/\s+/)[0];
  const editUrl = `${SITE_URL}?rsvp=edit&phone=${encodeURIComponent(record.phone || "")}#rsvp`;
  const calendarUrl = buildCalendarUrl_(record, attending, events);
  const intro = attending
    ? `Dear ${firstName}, your RSVP is confirmed. We are so happy to know you will be celebrating with us.`
    : `Dear ${firstName}, thank you for letting us know. We will miss you and will carry your love and good wishes with us.`;
  const plainBody = [
    intro,
    "",
    attending ? "Your RSVP details:" : "Your response:",
    `Name: ${record.name}`,
    `Response: ${attending ? "Joyfully attending" : "Unable to attend"}`,
    attending ? `Guests: ${record.guestCount}` : "",
    attending && events ? `Events:\n${events}` : "",
    "",
    `Venue: ${VENUE_NAME}, ${VENUE_ADDRESS}`,
    attending ? `${EMAIL_CALENDAR_LABEL}: ${calendarUrl}` : "",
    `${EMAIL_CTA_LABEL}: ${SITE_URL}`,
    `${EMAIL_EDIT_RSVP_LABEL}: ${editUrl}`,
    "",
    "With love,",
    "Ashwin & Akshata"
  ].filter(Boolean).join("\n");

  try {
    MailApp.sendEmail({
      to: record.email,
      subject,
      name: "Ashwin & Akshata",
      body: plainBody,
      htmlBody: buildConfirmationHtml_(record, attending, intro, events, action, editUrl, calendarUrl),
      attachments: attending
        ? [Utilities.newBlob(buildIcs_(record), "text/calendar", "ashwin-akshata-wedding.ics")]
        : []
    });
    return { sent: true };
  } catch (error) {
    console.error("RSVP confirmation email failed", error);
    return { sent: false, reason: String(error.message || error) };
  }
}

function buildConfirmationHtml_(record, attending, intro, events, action, editUrl, calendarUrl) {
  const eventRows = events
    ? events.split("\n").map((event) => `<li>${escapeHtml_(event)}</li>`).join("")
    : "";
  const statusLabel = attending ? "Joyfully attending" : "Unable to attend";
  const eyebrow = action === "updated" ? "RSVP updated" : "RSVP confirmed";
  const details = attending
    ? `
      <tr>
        <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#2E3B28;font-weight:700;">Guests</td>
        <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#3A2A20;text-align:right;">${escapeHtml_(record.guestCount)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#2E3B28;font-weight:700;vertical-align:top;">Events</td>
        <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#3A2A20;text-align:left;"><ul style="margin:0;padding-left:18px;">${eventRows}</ul></td>
      </tr>
    `
    : "";

  return `
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml_(intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;padding:0;background:#F7EFDD;color:#3A2A20;font-family:Arial,'Helvetica Neue',sans-serif;">
      <tr>
        <td align="center" style="padding:34px 14px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;background:#FCF7EC;border:1px solid #D9BE83;border-radius:22px;overflow:hidden;">
            <tr>
              <td align="center" style="background:#2E3B28;padding:30px 26px 28px;">
                <img src="${EMAIL_HERO_URL}" width="300" alt="Ashwin and Akshata" style="display:block;width:300px;max-width:82%;height:auto;border:0;margin:0 auto 18px;">
                <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#E4C474;font-weight:700;">${escapeHtml_(eyebrow)}</div>
                <h1 style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.08;font-weight:400;color:#F7EFDD;">Ashwin &amp; Akshata</h1>
                <p style="margin:10px 0 0;color:#F1E6CE;font-size:15px;line-height:1.6;">Sunday, August 16, 2026 &bull; ${VENUE_NAME}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 30px 8px;background:#FCF7EC;">
                <p style="font-size:18px;line-height:1.7;margin:0;color:#3A2A20;">${escapeHtml_(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 0;background:#FCF7EC;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0;background:#F7EFDD;border:1px solid #E7D4AC;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:12px 16px;color:#2E3B28;font-weight:700;">Name</td>
                    <td style="padding:12px 16px;color:#3A2A20;text-align:right;">${escapeHtml_(record.name || "Guest")}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#2E3B28;font-weight:700;">Response</td>
                    <td style="padding:12px 16px;border-top:1px solid #E7D4AC;color:#3A2A20;text-align:right;">${escapeHtml_(statusLabel)}</td>
                  </tr>
                  ${details}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 0;background:#FCF7EC;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:18px 18px;background:#2E3B28;border-radius:14px;color:#F7EFDD;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#E4C474;font-weight:700;">Venue</div>
                      <div style="margin-top:7px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;">${VENUE_NAME}</div>
                      <div style="margin-top:5px;color:#F1E6CE;font-size:14px;">${VENUE_ADDRESS}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 0;background:#FCF7EC;">
                <p style="font-size:16px;line-height:1.75;margin:0;color:#5B4634;">We cannot wait for a day filled with love, music, food, and memories. Thank you for being part of this celebration.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 30px 32px;background:#FCF7EC;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px 0;margin:0 auto;">
                  <tr>
                    ${attending ? `
                      <td align="center" style="border-radius:999px;background:#B98A38;">
                        <a href="${calendarUrl}" style="display:inline-block;padding:14px 20px;color:#2A1F0C;text-decoration:none;font-weight:700;font-size:15px;">${EMAIL_CALENDAR_LABEL}</a>
                      </td>
                    ` : ""}
                    <td align="center" style="border-radius:999px;background:#F7EFDD;border:1px solid #D9BE83;">
                      <a href="${SITE_URL}" style="display:inline-block;padding:14px 20px;color:#2A1F0C;text-decoration:none;font-weight:700;font-size:15px;">${EMAIL_CTA_LABEL}</a>
                    </td>
                    <td align="center" style="border-radius:999px;background:#2E3B28;">
                      <a href="${editUrl}" style="display:inline-block;padding:14px 20px;color:#F7EFDD;text-decoration:none;font-weight:700;font-size:15px;">${EMAIL_EDIT_RSVP_LABEL}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;color:#8A704E;font-size:12px;line-height:1.6;">If the buttons do not open, visit ${SITE_URL}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function buildCalendarUrl_(record, attending, eventsText) {
  const details = [
    attending ? "Ashwin and Akshata are excited to celebrate with you." : "Ashwin and Akshata's wedding celebration.",
    eventsText ? "Your RSVP events:\n" + eventsText : "",
    "Website: " + SITE_URL
  ].filter(Boolean).join("\n\n");

  return "https://calendar.google.com/calendar/render"
    + "?action=TEMPLATE"
    + "&text=" + encodeURIComponent("Ashwin & Akshata Wedding Celebration")
    + "&dates=20260816T163000Z/20260817T060000Z"
    + "&details=" + encodeURIComponent(details)
    + "&location=" + encodeURIComponent(VENUE_NAME + ", " + VENUE_ADDRESS);
}

function buildIcs_(record) {
  const selected = (record.attending && record.attending.length ? normalizeEvents_(record.attending) : ["muhurtham", "evening"])
    .map((id) => EVENT_ICS_DETAILS[id])
    .filter(Boolean);
  const events = selected.map((event) => [
    "BEGIN:VEVENT",
    "UID:" + event.id + "@akshwin-together",
    "DTSTAMP:" + toIcsDate_(new Date()),
    "DTSTART:" + event.start,
    "DTEND:" + event.end,
    "SUMMARY:" + escapeIcs_("Ashwin & Akshata - " + event.title),
    "DESCRIPTION:" + escapeIcs_(event.description),
    "LOCATION:" + escapeIcs_(VENUE_NAME + ", " + VENUE_ADDRESS),
    "END:VEVENT"
  ].join("\r\n")).join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AkshwinTogether//Wedding//EN",
    events,
    "END:VCALENDAR"
  ].join("\r\n");
}

const EVENT_ICS_DETAILS = {
  muhurtham: {
    id: "muhurtham",
    title: "Wedding & Muhurtham",
    start: "20260816T163000Z",
    end: "20260816T200000Z",
    description: "Wedding morning begins at 9:30 AM onwards Pacific, with the sacred muhurtham at 11:15 AM. Suggested attire: Indian traditional looks like saree and dhoti shirt are a lovely fit. Lunch will be served after the muhurtham."
  },
  evening: {
    id: "evening",
    title: "Evening Celebration",
    start: "20260817T000000Z",
    end: "20260817T060000Z",
    description: "Games, fun activities, music, and dancing accompanied by high tea, followed by dinner. Suggested attire: suits, Indian or western evening wear."
  }
};

function toIcsDate_(date) {
  return Utilities.formatDate(date, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

function escapeIcs_(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEvents_(events) {
  const allowed = {
    muhurtham: true,
    evening: true
  };
  return Array.from(new Set(
    (Array.isArray(events) ? events : [])
      .map((event) => EVENT_ALIASES[event] || event)
      .filter((event) => allowed[event])
  ));
}

function safeText_(value) {
  const text = String(value || "").trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
