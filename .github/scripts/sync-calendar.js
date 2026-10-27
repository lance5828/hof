// Fetches iCal feeds from Airbnb/Booking.com/Agoda plus a manually-managed Google
// Calendar (for Messenger/walk-in bookings), extracts booked date ranges, and writes
// them to data/synced-blocks.json. Run by .github/workflows/sync-calendar.yml on a
// schedule — no dependencies needed.
//
// It also compares each run with the previous one and sends a Telegram alert when
// Booking.com / Airbnb / Agoda dates are added (new booking) or removed (cancellation).

const fs = require('fs');
const path = require('path');

const SOURCES = [
  { name: 'Airbnb', url: process.env.AIRBNB_ICAL_URL },
  { name: 'Booking.com', url: process.env.BOOKINGCOM_ICAL_URL },
  { name: 'Agoda', url: process.env.AGODA_ICAL_URL },
  { name: 'Facebook Messenger', url: process.env.GOOGLE_CALENDAR_ICAL_URL }
].filter(function (s) { return s.url; });

// Channels that trigger a Telegram alert. Messenger/manual blocks are left out
// because you add those yourself.
const ALERT_SOURCES = ['Booking.com', 'Airbnb', 'Agoda'];

// Only alert on dates within the next year. Booking.com closes dates beyond its
// booking window, and that far-future block shifts forward every day — without
// this filter you'd get a false alert daily.
const ALERT_WINDOW_DAYS = 365;

// Where to go for the full booking details (the iCal feed only contains dates).
const DASHBOARD_LINKS = {
  'Booking.com': 'https://admin.booking.com',
  'Airbnb': 'https://www.airbnb.com/hosting/reservations',
  'Agoda': 'https://ycs.agoda.com'
};

const OUT_PATH = path.join(__dirname, '..', '..', 'data', 'synced-blocks.json');

// ===== iCal parsing =====

function unfoldLines(text) {
  // iCal continuation lines start with a space or tab — join them to the previous line.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function icsDateToIso(raw) {
  // Handles YYYYMMDD or YYYYMMDDTHHMMSSZ — we only need the date part (all-day booking blocks).
  var digits = raw.replace(/[^0-9]/g, '');
  var y = digits.slice(0, 4), m = digits.slice(4, 6), d = digits.slice(6, 8);
  return y + '-' + m + '-' + d;
}

function parseIcs(text, sourceName) {
  var lines = unfoldLines(text).split('\n');
  var blocks = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; }
    else if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.end) {
        blocks.push({ start: cur.start, end: cur.end, source: sourceName });
      }
      cur = null;
    } else if (cur) {
      if (line.indexOf('DTSTART') === 0) { cur.start = icsDateToIso(line.split(':')[1]); }
      else if (line.indexOf('DTEND') === 0) { cur.end = icsDateToIso(line.split(':')[1]); }
    }
  }
  return blocks;
}

async function fetchIcs(url) {
  var res = await fetch(url);
  if (!res.ok) { throw new Error('Fetch failed: ' + res.status); }
  return res.text();
}

// ===== Helpers =====

function readPreviousBlocks() {
  try {
    var prev = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    return Array.isArray(prev.blocks) ? prev.blocks : null;
  } catch (e) {
    return null;
  }
}

function blockKey(b) { return b.source + '|' + b.start + '|' + b.end; }

function manilaToday() {
  // YYYY-MM-DD in Philippine time, so "today" matches the property's calendar.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function addDays(iso, n) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(start, end) {
  return Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / 86400000);
}

function prettyDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
}

function isAlertable(b, today) {
  return ALERT_SOURCES.indexOf(b.source) !== -1 &&
    nightsBetween(b.start, b.end) > 0 &&
    b.end > today &&                                  // not already over
    b.start <= addDays(today, ALERT_WINDOW_DAYS);     // not the far-future closed window
}

function uniqueByKey(blocks) {
  var seen = {};
  return blocks.filter(function (b) {
    var k = blockKey(b);
    if (seen[k]) { return false; }
    seen[k] = true;
    return true;
  });
}

function describeStay(b) {
  var n = nightsBetween(b.start, b.end);
  return '📅 ' + prettyDate(b.start) + ' → ' + prettyDate(b.end) + ' (' + n + (n === 1 ? ' night)' : ' nights)');
}

// ===== Telegram =====

async function sendTelegram(text) {
  var token = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log('Telegram secrets not set — skipping alert:\n' + text);
    return;
  }
  try {
    var res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true })
    });
    if (!res.ok) {
      console.error('Telegram send failed: ' + res.status + ' ' + (await res.text()));
    } else {
      console.log('Telegram alert sent.');
    }
  } catch (e) {
    // Never fail the whole sync just because Telegram is down.
    console.error('Telegram send failed — ' + e.message);
  }
}

function newBookingMessage(b) {
  return '🔔 New ' + b.source + ' booking\n\n' +
    describeStay(b) + '\n\n' +
    'These dates are now blocked on your website.\n' +
    'The calendar feed only shows dates — open ' + b.source + ' for the guest name and payout ' +
    '(if you closed these dates yourself, you can ignore this):\n' +
    DASHBOARD_LINKS[b.source];
}

function cancellationMessage(b) {
  return '↩️ ' + b.source + ' dates freed up\n\n' +
    describeStay(b) + '\n\n' +
    'Likely a cancellation or date change. These dates are open again on your website ' +
    '(unless they are also blocked in your Google Calendar).\n' +
    DASHBOARD_LINKS[b.source];
}

// ===== Main =====

async function main() {
  var prevBlocks = readPreviousBlocks();
  var allBlocks = [];
  var failedSources = [];

  for (var i = 0; i < SOURCES.length; i++) {
    var s = SOURCES[i];
    try {
      var text = await fetchIcs(s.url);
      var blocks = parseIcs(text, s.name);
      console.log(s.name + ': ' + blocks.length + ' booked range(s) found');
      allBlocks = allBlocks.concat(blocks);
    } catch (e) {
      failedSources.push(s.name);
      // Keep this channel's dates from the last successful sync, so a temporary
      // outage doesn't open booked dates on the website or trigger false alerts.
      var kept = prevBlocks ? prevBlocks.filter(function (b) { return b.source === s.name; }) : [];
      allBlocks = allBlocks.concat(kept);
      console.error(s.name + ': failed to sync — ' + e.message + ' (kept ' + kept.length + ' range(s) from last sync)');
    }
  }

  var output = {
    _comment: 'Auto-generated by .github/workflows/sync-calendar.yml from Airbnb/Booking.com/Agoda and the manual-blocks Google Calendar. Do not edit by hand — changes will be overwritten on the next sync.',
    lastSynced: new Date().toISOString(),
    blocks: allBlocks
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log('Wrote ' + allBlocks.length + ' total block(s) to ' + OUT_PATH);

  // ----- Alerts -----
  if (process.env.TEST_ALERT === 'true') {
    await sendTelegram('✅ Home of France calendar alerts are connected.\n\nYou\'ll get a message here within about 30 minutes whenever Booking.com dates are booked or freed up.');
  }

  if (!prevBlocks) {
    console.log('No previous sync file — skipping alerts this run.');
    return;
  }

  var today = manilaToday();
  var prevKeys = new Set(prevBlocks.map(blockKey));
  var currentKeys = new Set(allBlocks.map(blockKey));

  var added = uniqueByKey(allBlocks.filter(function (b) {
    return !prevKeys.has(blockKey(b)) && isAlertable(b, today);
  }));

  var removed = uniqueByKey(prevBlocks.filter(function (b) {
    return failedSources.indexOf(b.source) === -1 &&
      !currentKeys.has(blockKey(b)) && isAlertable(b, today);
  }));

  console.log('Alerts: ' + added.length + ' new, ' + removed.length + ' freed up.');

  for (var a = 0; a < added.length; a++) { await sendTelegram(newBookingMessage(added[a])); }
  for (var r = 0; r < removed.length; r++) { await sendTelegram(cancellationMessage(removed[r])); }
}

main().catch(function (e) { console.error(e); process.exit(1); });
