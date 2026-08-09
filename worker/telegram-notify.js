// Cloudflare Worker for Home of France. Two endpoints:
//
//   POST /promo  → validates a promo code, returns { valid, code, percent }
//   POST /       → receives a booking submission and sends TWO Telegram messages:
//                  1. the internal alert (with a price-mismatch warning if the
//                     browser's total disagreed with this Worker's)
//                  2. a guest-ready confirmation in a tap-to-copy block, for
//                     pasting straight into Messenger
//
// Secrets stay server-side and are never exposed in the site's public JS.
// Deploy via the Cloudflare dashboard (Workers & Pages > Create > paste this
// code) and set these secrets:
//
//   TELEGRAM_BOT_TOKEN  — bot token from @BotFather
//   TELEGRAM_CHAT_ID    — chat to notify
//   PROMO_CODES         — JSON array of codes, e.g.
//                         [{"code":"WELCOME10","percent":10,"expires":"2026-12-31"}]
//                         "expires" is optional and inclusive (valid through that
//                         day, Manila time). Omit it for a code that never expires.
//
// Optional:
//   UNIT_INFO           — tower/unit number, WiFi, gate instructions. Added to
//                         the guest message under the address. Omitted if unset.
//                         Keep it here rather than in the repo — the repo is public.
//
// Promo codes live here rather than in the site's files because anything the
// page can read, a visitor can read — the site is static and served publicly,
// so a code shipped to the browser is a public code.
//
// This same Worker can later be extended with a PayMongo checkout-session
// endpoint for automated card payments.

// CORS is not a security boundary — it only constrains browsers, not curl. It's
// here to stop other sites from driving these endpoints on a visitor's behalf.
// Real brute-force protection belongs in a Cloudflare rate-limiting rule.
const ALLOWED_ORIGINS = [
  'https://hofstaycation.com',
  'https://www.hofstaycation.com',
  'http://localhost:8743' // local preview server
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

// ===== Pricing (authoritative copy) =====
// The site computes the same numbers for display, but the browser is not
// trusted: a tampered page can post any total it likes. Every booking is
// re-priced here and the Telegram message reports THIS number.

const DEPOSIT_AMOUNT = 1000;
const NIGHTLY_WEEKDAY = 2200;
const NIGHTLY_WEEKEND = 2500; // Fri & Sat
const EXTRA_GUEST_PER_NIGHT = 200;
const FREE_GUESTS = 2;
const TOWELS_FLAT = 50;
const PARKING_PER_NIGHT = 500;
const MULTI_NIGHT_DISCOUNT_PER_NIGHT = 100;

// Today's date in Manila (UTC+8, no DST). The Worker runs in UTC, so using the
// raw UTC date would expire codes up to 8 hours early for guests booking at night.
function manilaToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function nightsBetween(checkin, checkout) {
  const a = Date.parse(checkin + 'T00:00:00Z');
  const b = Date.parse(checkout + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return 0;
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : 0;
}

function priceBooking(input) {
  const nights = nightsBetween(input.checkin, input.checkout);
  if (!nights) return null;

  const guests = Math.max(1, Math.min(4, Number(input.guests) || 1));

  let room = 0;
  const start = Date.parse(input.checkin + 'T00:00:00Z');
  for (let i = 0; i < nights; i++) {
    // getUTCDay on a UTC-parsed date reads the calendar day as written, with no
    // timezone shift. 5 = Fri, 6 = Sat.
    const day = new Date(start + i * 86400000).getUTCDay();
    room += (day === 5 || day === 6) ? NIGHTLY_WEEKEND : NIGHTLY_WEEKDAY;
  }

  const discount = nights > 1 ? MULTI_NIGHT_DISCOUNT_PER_NIGHT * nights : 0;
  const extraGuest = Math.max(0, guests - FREE_GUESTS) * EXTRA_GUEST_PER_NIGHT * nights;
  const towels = input.towels ? TOWELS_FLAT : 0;
  const parking = input.parking ? PARKING_PER_NIGHT * nights : 0;

  const subtotal = room - discount + extraGuest + towels + parking;
  const percent = Number(input.promoPercent) || 0;
  const promoDiscount = percent > 0 ? Math.round(subtotal * percent / 100) : 0;
  const total = subtotal - promoDiscount;
  const deposit = Math.min(DEPOSIT_AMOUNT, total);

  return {
    nights, room, discount, extraGuest, towels, parking,
    promoDiscount, total, deposit, balance: total - deposit
  };
}

// ===== Promo codes =====

function loadPromoCodes(env) {
  try {
    const parsed = JSON.parse(env.PROMO_CODES || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return []; // a malformed secret must not take the booking form down
  }
}

// Whitespace and case are ignored so a code pasted from a phone keyboard,
// or read aloud with gaps, still lands.
function normalizeCode(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
}

function lookupPromo(env, raw) {
  const key = normalizeCode(raw);
  if (!key) return null;
  const today = manilaToday();
  const match = loadPromoCodes(env).filter(function (c) {
    return normalizeCode(c.code) === key;
  })[0];
  if (!match) return null;
  // "expires" is inclusive: a code dated today still works today.
  if (match.expires && match.expires < today) return null;
  return { code: normalizeCode(match.code), percent: Number(match.percent) || 0 };
}

function peso(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH');
}

// Telegram rejects the whole message (400, so NO notification arrives) if an
// interpolated value contains a stray < or &. A guest named "Smith & Co" is
// enough to do it, so every value below goes through here.
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-08-20" -> "Thu, 20 Aug 2026". Parsed as UTC and read back with getUTC*
// so the calendar date is never shifted by the Worker's timezone.
function guestDate(dateStr) {
  const t = Date.parse(String(dateStr || '') + 'T00:00:00Z');
  if (!isFinite(t)) return String(dateStr || '—');
  const d = new Date(t);
  return DAY_NAMES[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' +
    MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

// The message the host copies and sends to the guest. Deliberately plain text —
// it's pasted into Messenger, where HTML tags would show up literally.
function formatGuestMessage(d, priced, unitInfo) {
  const firstName = String(d.name || '').trim().split(/\s+/)[0] || 'there';
  const nights = priced ? priced.nights : Number(d.nights) || 0;
  const nightsWord = nights === 1 ? 'night' : 'nights';

  const extras = [];
  if (d.towels === 'yes') extras.push('Towels');
  if (d.parking === 'yes') extras.push('Basement parking');

  const lines = [
    'Hi ' + firstName + '! Your booking at Home of France is confirmed. 🏠',
    '',
    '📍 SMDC Wind Residences, Tagaytay City',
  ];

  // Tower/unit number, WiFi, gate instructions — whatever you'd normally type
  // out by hand. Set as the UNIT_INFO variable in the Worker so it stays out of
  // the public repo. Omitted entirely when unset.
  if (unitInfo && String(unitInfo).trim()) {
    lines.push(String(unitInfo).trim());
  }

  lines.push(
    '',
    '📅 Check-in:  ' + guestDate(d.checkin) + ', 2:00 PM',
    '📅 Check-out: ' + guestDate(d.checkout) + ', 12:00 PM',
    '🌙 ' + nights + ' ' + nightsWord,
    '👥 ' + (d.guests || '—') + ' guest(s)'
  );

  if (extras.length) lines.push('✅ Included: ' + extras.join(', '));

  // Only worth asking when someone else is coming — for a solo booking the
  // form already gave us the one name we need.
  const guestCount = Number(d.guests) || 0;
  if (guestCount > 1) {
    lines.push(
      '',
      'Could you please send us the complete names of all ' + guestCount +
      ' guests? We need them for building registration and security check-in.'
    );
  }

  lines.push(
    '',
    '💰 Total: ' + peso(priced ? priced.total : 0),
    '✅ Deposit received: ' + peso(priced ? priced.deposit : 0),
    '💵 Balance due at check-in: ' + peso(priced ? priced.balance : 0)
  );

  lines.push(
    '',
    'Just message us here if you need anything before your stay. See you in Tagaytay! 🌄'
  );

  return lines.join('\n');
}

function formatBookingMessage(d, priced, mismatch) {
  const lines = [
    '🏠 <b>New Booking Request</b>',
    '',
    '👤 ' + esc(d.name || '—'),
    '📧 ' + esc(d.email || '—'),
    '📱 ' + esc(d.phone || '—'),
    '📘 FB name: ' + esc(d.facebook_name || '—'),
    '',
    '📅 ' + esc(d.checkin || '—') + ' → ' + esc(d.checkout || '—') + ' (' + esc(d.nights || '—') + ' nights)',
    '👥 ' + esc(d.guests || '—') + ' guest(s)',
    '🎟 Promo: ' + (d.promo_code && d.promo_code !== 'none'
      ? (esc(d.promo_code) + ' (−' + peso(priced ? priced.promoDiscount : 0) + ')')
      : 'none'),
    '💰 Total: ' + (priced ? peso(priced.total) : esc(d.total || '—')),
    '💵 Deposit paid: ' + (priced ? peso(priced.deposit) : esc(d.deposit_paid || '—')),
    '🏷 Balance at check-in: ' + (priced ? peso(priced.balance) : esc(d.balance_due_at_checkin || '—')),
    '',
    '💳 Payment: ' + esc(d.payment_method || '—'),
    '📎 GCash ref: ' + esc(d.gcash_reference || '—')
  ];

  if (mismatch) {
    lines.push(
      '',
      '⚠️ <b>PRICE MISMATCH — verify before confirming</b>',
      'Browser reported: ' + peso(mismatch.client),
      'Server computed:  ' + peso(mismatch.server)
    );
  }

  return lines.join('\n');
}

// ===== Handlers =====

async function handlePromo(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ valid: false }, 400, request);
  }

  const promo = lookupPromo(env, body.code);
  if (!promo) {
    // Deliberately identical for "no such code" and "expired" — distinguishing
    // them tells a guesser when they've found a real code.
    return json({ valid: false }, 200, request);
  }
  return json({ valid: true, code: promo.code, percent: promo.percent }, 200, request);
}

async function handleBooking(request, env) {
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return new Response('Bad request', { status: 400, headers: corsHeaders(request) });
  }

  // Re-resolve the promo server-side. A browser claiming a discount it didn't
  // earn gets priced as if it had no code at all.
  const promo = lookupPromo(env, data.promo_code);
  const priced = priceBooking({
    checkin: data.checkin,
    checkout: data.checkout,
    guests: data.guests,
    towels: data.towels === 'yes',
    parking: data.parking === 'yes',
    promoPercent: promo ? promo.percent : 0
  });

  let mismatch = null;
  if (priced && data.total_raw !== undefined && Number(data.total_raw) !== priced.total) {
    mismatch = { client: Number(data.total_raw), server: priced.total };
  }

  const tgRes = await sendTelegram(env, formatBookingMessage(data, priced, mismatch));

  if (!tgRes.ok) {
    const errText = await tgRes.text();
    return new Response('Failed to send notification: ' + errText, { status: 502, headers: corsHeaders(request) });
  }

  // Second message: the guest-ready text, wrapped in <pre> so Telegram renders
  // it as a code block with a one-tap copy button. Best-effort — the booking
  // alert above already arrived, so a failure here must not fail the request.
  try {
    const guestText = formatGuestMessage(data, priced, env.UNIT_INFO);
    await sendTelegram(env, '📋 <b>Send to guest</b> — tap to copy\n\n<pre>' + esc(guestText) + '</pre>');
  } catch (e) {
    // swallow: the host can still write the message by hand
  }

  return json({ ok: true }, 200, request);
}

function sendTelegram(env, text) {
  return fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

function json(payload, status, request) {
  return new Response(JSON.stringify(payload), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(request))
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(request) });
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path === '/promo') return handlePromo(request, env);
    return handleBooking(request, env);
  }
};
