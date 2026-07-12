// ===== Booking state =====
var state = {
  step: 1,
  submitted: false,
  checkin: '',
  checkout: '',
  guests: 1,
  addons: { towels: false, pool: 'none', parking: false },
  name: '', email: '', phone: '', refNo: '', fbName: '',
  payMethod: 'gcash'
};

function peso(n) { return '₱' + n.toLocaleString('en-PH'); }

// ===== Availability (blocked dates from other booking channels) =====
var blockedRanges = []; // [{start:'YYYY-MM-DD', end:'YYYY-MM-DD', source:'...'}] — end is checkout day, exclusive

// Formats a Date using its LOCAL calendar fields — toISOString() converts to UTC first,
// which silently shifts the date by a day in positive-UTC-offset timezones.
function toLocalDateStr(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00');
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

// True if any night in [checkinStr, checkoutStr) overlaps a blocked range.
function rangeOverlapsBlocked(checkinStr, checkoutStr) {
  var a = new Date(checkinStr + 'T00:00');
  var b = new Date(checkoutStr + 'T00:00');
  return blockedRanges.some(function (r) {
    var rs = new Date(r.start + 'T00:00');
    var re = new Date(r.end + 'T00:00');
    return a < re && b > rs; // standard interval overlap check
  });
}

async function loadAvailability() {
  try {
    var results = await Promise.all([
      fetch('data/manual-blocks.json').then(function (r) { return r.json(); }).catch(function () { return { blocks: [] }; }),
      fetch('data/synced-blocks.json').then(function (r) { return r.json(); }).catch(function () { return { blocks: [] }; })
    ]);
    var manual = results[0].blocks || [];
    var synced = results[1].blocks || [];
    blockedRanges = manual.concat(synced);
  } catch (e) {
    blockedRanges = [];
  }
  return flatpickrDisableRanges();
}

// Flatpickr's range "to" is inclusive, so we subtract a day from our exclusive checkout-day convention.
function flatpickrDisableRanges() {
  return blockedRanges.map(function (r) {
    return { from: r.start, to: addDays(r.end, -1) };
  });
}

function calc() {
  var empty = { nights: 0, room: 0, discount: 0, extraGuest: 0, towels: 0, pool: 0, parking: 0, total: 0, valid: false };
  if (!state.checkin || !state.checkout) return empty;
  var a = new Date(state.checkin + 'T00:00');
  var b = new Date(state.checkout + 'T00:00');
  var nights = Math.round((b - a) / 86400000);
  if (!(nights > 0)) return empty;

  var guests = state.guests;
  var ad = state.addons;
  var room = 0;
  for (var i = 0; i < nights; i++) {
    var d = new Date(a);
    d.setDate(a.getDate() + i);
    var day = d.getDay(); // 5=Fri, 6=Sat
    room += (day === 5 || day === 6) ? 2500 : 2200;
  }
  var discount = nights > 1 ? 100 * nights : 0;
  var extraGuest = Math.max(0, guests - 2) * 200;
  var towels = ad.towels ? 50 : 0;
  var pool = ad.pool === 'holiday' ? 300 * guests : (ad.pool === 'regular' ? 150 * guests : 0);
  var parking = ad.parking ? 450 * nights : 0;
  var total = room - discount + extraGuest + towels + pool + parking;
  return { nights: nights, room: room, discount: discount, extraGuest: extraGuest, towels: towels, pool: pool, parking: parking, total: total, valid: true, guests: guests };
}

// ===== Modal open/close =====
function openModal() {
  state.step = 1;
  state.submitted = false;
  document.getElementById('bookingModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  render();
}
function closeModal() {
  document.getElementById('bookingModal').classList.remove('open');
  document.body.style.overflow = '';
}

// ===== Field handlers =====
function guestPlus() { state.guests = Math.min(4, state.guests + 1); render(); }
function guestMinus() { state.guests = Math.max(1, state.guests - 1); render(); }

function setPayMethod(m) {
  state.payMethod = m;
  document.getElementById('tabGcash').classList.toggle('active', m === 'gcash');
  document.getElementById('tabCard').classList.toggle('active', m === 'card');
  document.getElementById('gcashPane').classList.toggle('active', m === 'gcash');
  document.getElementById('cardPane').classList.toggle('active', m === 'card');
  document.getElementById('payNextBtn').style.display = m === 'gcash' ? 'inline-block' : 'none';
  clearError('step2Error');
}

function showError(id, msg) {
  var el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}
function clearError(id) {
  var el = document.getElementById(id);
  el.style.display = 'none';
}

// ===== Navigation between steps =====
function goNext() {
  clearError('step1Error');
  var c = calc();
  if (!state.checkin || !state.checkout) { return showError('step1Error', 'Please choose your check-in and check-out dates.'); }
  if (c.nights <= 0) { return showError('step1Error', 'Check-out must be after check-in.'); }
  if (rangeOverlapsBlocked(state.checkin, state.checkout)) { return showError('step1Error', 'Sorry, some of those dates are already booked. Please choose different dates.'); }
  if (!state.name.trim()) { return showError('step1Error', 'Please enter your full name.'); }
  if (!/.+@.+\..+/.test(state.email)) { return showError('step1Error', 'Please enter a valid email address.'); }
  if (state.phone.replace(/\D/g, '').length < 7) { return showError('step1Error', 'Please enter a valid mobile number.'); }
  state.step = 2;
  render();
}
function goBack() {
  state.step = Math.max(1, state.step - 1);
  clearError('step2Error');
  clearError('step3Error');
  render();
}
function payNext() {
  if (state.payMethod !== 'gcash') return; // card is disabled (coming soon)
  clearError('step2Error');
  state.step = 3;
  render();
}
var FORMSPREE_ENDPOINT = 'https://formspree.io/f/xykqnwpl';
var TELEGRAM_NOTIFY_ENDPOINT = 'https://hof-notify.hofstaycation.workers.dev/';

async function submitBooking() {
  clearError('step3Error');
  if (!state.refNo.trim()) { return showError('step3Error', 'Please enter your GCash reference number.'); }
  if (!state.fbName.trim()) { return showError('step3Error', 'Please enter your Facebook name so we can find you on Messenger.'); }

  var c = calc();
  var bookingData = {
    name: state.name,
    email: state.email,
    phone: state.phone,
    facebook_name: state.fbName,
    checkin: state.checkin,
    checkout: state.checkout,
    nights: c.nights,
    guests: state.guests,
    towels: state.addons.towels ? 'yes' : 'no',
    parking: state.addons.parking ? 'yes' : 'no',
    pool: state.addons.pool,
    total: peso(c.total),
    payment_method: state.payMethod,
    gcash_reference: state.refNo
  };

  // Instant Telegram push — best-effort, never blocks the booking on failure.
  fetch(TELEGRAM_NOTIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData)
  }).catch(function () { /* Formspree below remains the reliable record either way */ });

  var fd = new FormData();
  fd.append('_subject', 'New booking request — Home of France');
  Object.keys(bookingData).forEach(function (k) { fd.append(k, bookingData[k]); });

  var btn = document.getElementById('submitBookingBtn');
  var originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    var res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      body: fd,
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      state.submitted = true;
      render();
    } else {
      showError('step3Error', 'Something went wrong sending your booking. Please try again, or message us on Facebook.');
    }
  } catch (e) {
    showError('step3Error', 'Something went wrong sending your booking. Please try again, or message us on Facebook.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// ===== Render =====
function fmtDate(d) {
  if (!d) return '—';
  var dt = new Date(d + 'T00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function render() {
  var c = calc();
  var done = state.submitted;
  var stepNum = done ? 4 : state.step;
  var fill = done ? 100 : (state.step / 3) * 100;
  var stepNames = { 1: 'Details', 2: 'Payment', 3: 'Proof' };

  document.getElementById('stepTag').textContent = done ? 'Confirmed' : ('Step ' + stepNum + ' of 3 · ' + stepNames[state.step]);
  document.getElementById('progressFill').style.width = fill + '%';

  ['step1', 'step2', 'step3', 'stepDone'].forEach(function (id) { document.getElementById(id).classList.remove('active'); });
  if (done) {
    document.getElementById('stepDone').classList.add('active');
  } else {
    document.getElementById('step' + state.step).classList.add('active');
  }

  document.getElementById('guestsLabel').textContent = state.guests;

  var totalLabel = c.valid ? peso(c.total) : '—';
  document.getElementById('totalLabel1').textContent = totalLabel;
  document.getElementById('totalLabel2').textContent = totalLabel;
  document.getElementById('totalLabel3').textContent = totalLabel;

  var nightsWord = c.nights > 1 ? ' nights' : ' night';
  document.getElementById('parkingHint').textContent = c.valid && c.nights > 0 ? ('₱450 × ' + c.nights + nightsWord) : '₱450 / night';

  // price breakdown
  document.getElementById('priceRows').style.display = c.valid ? 'flex' : 'none';
  document.getElementById('priceEmpty').style.display = c.valid ? 'none' : 'block';
  if (c.valid) {
    document.getElementById('roomRowLabel').textContent = 'Room · ' + c.nights + nightsWord;
    document.getElementById('roomLabel').textContent = peso(c.room);

    document.getElementById('discountRow').style.display = c.discount > 0 ? 'flex' : 'none';
    if (c.discount > 0) document.getElementById('discountLabel').textContent = '−' + peso(c.discount);

    document.getElementById('extraRow').style.display = c.extraGuest > 0 ? 'flex' : 'none';
    if (c.extraGuest > 0) {
      document.getElementById('extraRowLabel').textContent = 'Extra guests · ' + Math.max(0, state.guests - 2);
      document.getElementById('extraLabel').textContent = '+' + peso(c.extraGuest);
    }

    document.getElementById('towelsRow').style.display = c.towels > 0 ? 'flex' : 'none';
    if (c.towels > 0) document.getElementById('towelsLabel').textContent = '+' + peso(c.towels);

    document.getElementById('poolRow').style.display = c.pool > 0 ? 'flex' : 'none';
    if (c.pool > 0) {
      var poolDesc = state.addons.pool === 'holiday' ? 'Pool access (holiday)' : 'Pool access';
      document.getElementById('poolRowLabel').textContent = poolDesc + ' · ' + state.guests;
      document.getElementById('poolLabel').textContent = '+' + peso(c.pool);
    }

    document.getElementById('parkingRow').style.display = c.parking > 0 ? 'flex' : 'none';
    if (c.parking > 0) {
      document.getElementById('parkingRowLabel').textContent = 'Parking · ' + c.nights + nightsWord;
      document.getElementById('parkingLabel').textContent = '+' + peso(c.parking);
    }
  }

  // done screen
  if (done) {
    var firstName = (state.name.trim().split(/\s+/)[0]) || 'traveler';
    document.getElementById('doneFirstName').textContent = firstName;
    var datesLabel = (state.checkin && state.checkout && c.nights > 0)
      ? (fmtDate(state.checkin) + ' – ' + fmtDate(state.checkout) + ' · ' + c.nights + nightsWord)
      : '—';
    document.getElementById('doneDates').textContent = datesLabel;
    document.getElementById('doneGuests').textContent = state.guests;
    document.getElementById('doneTotal').textContent = totalLabel;
  }
}

// ===== Wire up inputs =====
document.addEventListener('DOMContentLoaded', async function () {
  var today = toLocalDateStr(new Date());
  var checkinEl = document.getElementById('checkin');
  var checkoutEl = document.getElementById('checkout');

  var disableRanges = await loadAvailability();

  var checkoutPicker = flatpickr(checkoutEl, {
    dateFormat: 'Y-m-d',
    altInput: true,
    altInputClass: 'hof-input',
    altFormat: 'M j, Y',
    minDate: today,
    disable: disableRanges,
    onChange: function (selectedDates, dateStr) {
      state.checkout = dateStr;
      render();
    }
  });
  checkoutPicker.altInput.id = 'checkoutDisplay';

  var checkinPicker = flatpickr(checkinEl, {
    dateFormat: 'Y-m-d',
    altInput: true,
    altInputClass: 'hof-input',
    altFormat: 'M j, Y',
    minDate: today,
    disable: disableRanges,
    onChange: function (selectedDates, dateStr) {
      state.checkin = dateStr;
      if (dateStr) {
        checkoutPicker.set('minDate', addDays(dateStr, 1));
        if (state.checkout && new Date(state.checkout + 'T00:00') <= new Date(dateStr + 'T00:00')) {
          state.checkout = '';
          checkoutPicker.clear();
        }
      }
      render();
    }
  });
  checkinPicker.altInput.id = 'checkinDisplay';

  document.getElementById('guestName').addEventListener('input', function (e) { state.name = e.target.value; });
  document.getElementById('guestEmail').addEventListener('input', function (e) { state.email = e.target.value; });
  document.getElementById('guestPhone').addEventListener('input', function (e) { state.phone = e.target.value; });
  document.getElementById('refNo').addEventListener('input', function (e) { state.refNo = e.target.value; });
  document.getElementById('fbName').addEventListener('input', function (e) { state.fbName = e.target.value; });

  document.getElementById('addonTowels').addEventListener('change', function (e) { state.addons.towels = e.target.checked; render(); });
  document.getElementById('addonParking').addEventListener('change', function (e) { state.addons.parking = e.target.checked; render(); });
  document.getElementById('addonPool').addEventListener('change', function (e) { state.addons.pool = e.target.value; render(); });

  // reveal on scroll
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.hof-reveal'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('hof-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('hof-visible'); });
  }

  // nav condense + hero parallax
  var nav = document.getElementById('hof-nav');
  var heroImgWrap = document.getElementById('hof-hero-img-wrap');
  var parallaxIntensity = 0.32;
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    nav.classList.toggle('hof-nav-solid', y > 60);
    if (heroImgWrap) heroImgWrap.style.transform = 'translateY(' + (y * parallaxIntensity) + 'px)';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  render();
});
