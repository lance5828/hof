// Cloudflare Worker: receives a booking submission from the site and forwards it
// as a Telegram message. The bot token stays server-side as a Worker secret —
// never exposed in the site's public JS. Deploy via the Cloudflare dashboard
// (Workers & Pages > Create > paste this code) and set secrets:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
//
// This same Worker can later be extended with a PayMongo checkout-session
// endpoint for automated card payments.

const ALLOWED_ORIGIN = '*'; // tighten to your live domain once it's set up, e.g. 'https://homeoffrance.com'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function formatBookingMessage(d) {
  var lines = [
    '🏠 <b>New Booking Request</b>',
    '',
    '👤 ' + (d.name || '—'),
    '📧 ' + (d.email || '—'),
    '📱 ' + (d.phone || '—'),
    '📘 FB name: ' + (d.facebook_name || '—'),
    '',
    '📅 ' + (d.checkin || '—') + ' → ' + (d.checkout || '—') + ' (' + (d.nights || '—') + ' nights)',
    '👥 ' + (d.guests || '—') + ' guest(s)',
    '💰 Total: ' + (d.total || '—'),
    '💵 Deposit paid: ' + (d.deposit_paid || '—'),
    '🏷 Balance at check-in: ' + (d.balance_due_at_checkin || '—'),
    '',
    '💳 Payment: ' + (d.payment_method || '—'),
    '📎 GCash ref: ' + (d.gcash_reference || '—')
  ];
  return lines.join('\n');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    var data;
    try {
      data = await request.json();
    } catch (e) {
      return new Response('Bad request', { status: 400, headers: corsHeaders() });
    }

    var text = formatBookingMessage(data);

    var tgRes = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });

    if (!tgRes.ok) {
      var errText = await tgRes.text();
      return new Response('Failed to send notification: ' + errText, { status: 502, headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders())
    });
  }
};
