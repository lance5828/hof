window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 80);
});

const rooms = [
  { name: '1BR Skyline / City View', tag: 'Tower 4 · 21st Floor', price: 2200, weekendPrice: 2500, stars: '★★★★★', meta: '1-2 Guests · Max 4 · Queen Bed + Double Sofa Bed', img: 'images/room-bedroom-blue-curtains.jpeg' },
];

let currentRoom = null;
let highestReachedStep = 1;

function showBookingStep(step) {
  highestReachedStep = Math.max(highestReachedStep, step);
  const steps = [1, 2, 3];
  steps.forEach(n => {
    const panel = document.getElementById(`booking-step-${n}`);
    const chip = document.getElementById(`step-chip-${n}`);
    if (panel) panel.classList.toggle('active', n === step);
    if (chip) chip.classList.toggle('active', n === step);
  });
}

function hasRequiredBookingDetails() {
  const firstName = document.getElementById('fname').value.trim();
  const lastName = document.getElementById('lname').value.trim();
  const contact = document.getElementById('email').value.trim();
  const checkin = document.getElementById('checkin').value;
  const checkout = document.getElementById('checkout').value;
  return !!(firstName && lastName && contact && checkin && checkout);
}

function goToBookingStep(step) {
  if (step === 1) {
    showBookingStep(1);
    return;
  }

  if (step === 2) {
    if (!hasRequiredBookingDetails()) {
      alert('Please complete your booking details first.');
      showBookingStep(1);
      return;
    }
    renderPaymentSummary();
    showBookingStep(2);
    return;
  }

  if (step === 3) {
    if (highestReachedStep < 3) {
      alert('Please proceed through the payment step first.');
      return;
    }
    showBookingStep(3);
  }
}

function formatPeso(amount) {
  return '₱' + Number(amount || 0).toLocaleString();
}

function formatDateForDisplay(isoDate) {
  if (!isoDate || isoDate === 'Not set') return 'Not set';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function computeBookingTotal() {
  if (!currentRoom) return 0;
  if (currentRoom.flat) return currentRoom.price;

  const cin = document.getElementById('checkin').value;
  const cout = document.getElementById('checkout').value;
  if (!cin || !cout) return currentRoom.price;

  const nights = Math.max(1, (new Date(cout) - new Date(cin)) / 86400000);
  const guestCount = Number(document.getElementById('guests').value || 2);
  let roomTotal = 0;
  const start = new Date(cin);

  for (let i = 0; i < nights; i++) {
    const stayDate = new Date(start);
    stayDate.setDate(start.getDate() + i);
    const day = stayDate.getDay();
    const nightlyRate = (day === 5 || day === 6) ? currentRoom.weekendPrice : currentRoom.price;
    roomTotal += nightlyRate;
  }

  if (nights > 1) {
    roomTotal -= 100 * nights;
  }

  let extra = Math.max(0, guestCount - 2) * 200;
  const addonCheckboxes = document.querySelectorAll('.addon-checkbox:checked');
  addonCheckboxes.forEach(addon => {
    const value = addon.value;
    if (value === 'towel') extra += 50;
    if (value === 'pool-regular') extra += 150 * guestCount;
    if (value === 'pool-holiday') extra += 300 * guestCount;
    if (value === 'parking') extra += 450 * nights;
  });

  return roomTotal + extra;
}

function updateSpecialOccasionFeeNotes() {
  const bookingNote = document.getElementById('occasion-fee-note');
  const paymentNote = document.getElementById('payment-occasion-fee-note');
  const specialOccasion = document.getElementById('special-occasion');
  const showNote = !!(specialOccasion && specialOccasion.checked);

  if (bookingNote) bookingNote.style.display = showNote ? 'block' : 'none';
  if (paymentNote) paymentNote.style.display = showNote ? 'block' : 'none';
}

function renderPaymentSummary() {
  const summary = document.getElementById('payment-summary');
  const paymentTotal = document.getElementById('payment-total-display');
  const paymentDeposit = document.getElementById('payment-deposit-display');
  const paymentRemaining = document.getElementById('payment-remaining-display');
  if (!summary) return;

  const cin = document.getElementById('checkin').value || 'Not set';
  const cout = document.getElementById('checkout').value || 'Not set';
  const nights = (cin !== 'Not set' && cout !== 'Not set') ? Math.max(1, (new Date(cout) - new Date(cin)) / 86400000) : 1;
  const guests = document.getElementById('guests').value || '2';
  const fullName = `${document.getElementById('fname').value} ${document.getElementById('lname').value}`.trim();
  const displayCin = formatDateForDisplay(cin);
  const displayCout = formatDateForDisplay(cout);

  summary.innerHTML = `
    <div class="summary-item"><span>Guest Name</span><strong>${fullName || 'Not set'}</strong></div>
    <div class="summary-item"><span>Contact</span><strong>${document.getElementById('email').value || 'Not set'}</strong></div>
    <div class="summary-item"><span>Stay Dates</span><strong>${displayCin} to ${displayCout}</strong></div>
    <div class="summary-item"><span>Nights</span><strong>${nights}</strong></div>
    <div class="summary-item"><span>Guests</span><strong>${guests}</strong></div>
    <div class="summary-item"><span>Unit</span><strong>${currentRoom ? currentRoom.name : '1BR Skyline / City View'}</strong></div>
  `;

  const totalAmount = computeBookingTotal();
  const depositAmount = Math.min(1000, totalAmount);
  const remainingAmount = Math.max(0, totalAmount - depositAmount);

  if (paymentDeposit && paymentRemaining) {
    paymentDeposit.textContent = formatPeso(depositAmount);
    paymentRemaining.textContent = formatPeso(remainingAmount);
  } else if (paymentTotal) {
    paymentTotal.textContent = formatPeso(totalAmount);
  }

  updateSpecialOccasionFeeNotes();
}

function openModal(room) {
  currentRoom = room || rooms[0];
  highestReachedStep = 1;
  document.getElementById('modal-success').style.display = 'none';
  document.getElementById('modal-form').style.display = 'block';
  showBookingStep(1);

  const refInput = document.getElementById('gcash-reference');
  const screenshotInput = document.getElementById('payment-screenshot');
  if (refInput) refInput.value = '';
  if (screenshotInput) screenshotInput.value = '';

  const priceLabel = currentRoom.flat ? `₱${currentRoom.price.toLocaleString()} flat rate` : `Weekday ₱${currentRoom.price.toLocaleString()} · Weekend ₱${currentRoom.weekendPrice.toLocaleString()}`;
  document.getElementById('modal-room-info').innerHTML = `
    <img class="modal-room-img" src="${currentRoom.img}" alt="">
    <div><div class="modal-room-name">${currentRoom.name}</div><div class="modal-room-price">${priceLabel}</div><div style="font-size:.72rem;color:var(--muted)">${currentRoom.meta||''}</div></div>`;
  updateTotal();
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
const modal = document.getElementById('modal');
if (modal) {
  modal.addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
}

function updateTotal() {
  if (!currentRoom) return;
  document.getElementById('total-display').textContent = formatPeso(computeBookingTotal());
  updateSpecialOccasionFeeNotes();
}
['checkin','checkout','guests'].forEach(id => {
  const field = document.getElementById(id);
  if (!field) return;
  field.addEventListener('change', updateTotal);
  field.addEventListener('input', updateTotal);
});

// Add listeners for multiple add-on checkboxes
document.querySelectorAll('.addon-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', updateTotal);
});

// Special Occasion Setup toggle
const specialOccasionCheckbox = document.getElementById('special-occasion');
const specialOccasionDetails = document.getElementById('special-occasion-details');
if (specialOccasionCheckbox) {
  specialOccasionCheckbox.addEventListener('change', () => {
    specialOccasionDetails.style.display = specialOccasionCheckbox.checked ? 'block' : 'none';
    updateSpecialOccasionFeeNotes();
  });
}
updateSpecialOccasionFeeNotes();

function submitBooking() {
  if (!hasRequiredBookingDetails()) {
    alert('Please complete all required booking details before continuing to payment.');
    return;
  }

  renderPaymentSummary();
  showBookingStep(2);
}

function goToProofStep() {
  renderPaymentSummary();
  showBookingStep(3);
}

function submitPaymentProof() {
  const gcashReference = document.getElementById('gcash-reference').value.trim();
  const screenshotInput = document.getElementById('payment-screenshot');
  const hasScreenshot = screenshotInput && screenshotInput.files && screenshotInput.files.length > 0;

  if (!gcashReference || !hasScreenshot) {
    alert('Please provide your GCash reference number and payment screenshot.');
    return;
  }

  document.getElementById('modal-form').style.display = 'none';
  document.getElementById('modal-success').style.display = 'block';
}

const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const oneYearFromToday = new Date();
oneYearFromToday.setFullYear(oneYearFromToday.getFullYear() + 1);
const maxDate = oneYearFromToday.toISOString().split('T')[0];

// Initialize Flatpickr for Check-In
const checkInPickr = flatpickr('#checkin', {
  minDate: today,
  maxDate: maxDate,
  dateFormat: 'Y-m-d',
  altInput: true,
  altFormat: 'd/m/Y',
  theme: 'dark',
  onChange: () => {
    syncCheckoutMinDate();
    updateTotal();
  },
  onClose: () => {
    if (checkinField.value) checkoutField.focus();
  }
});

// Initialize Flatpickr for Check-Out
const checkoutPickr = flatpickr('#checkout', {
  minDate: today,
  maxDate: maxDate,
  dateFormat: 'Y-m-d',
  altInput: true,
  altFormat: 'd/m/Y',
  theme: 'dark',
  onChange: () => {
    updateTotal();
  }
});

// Keep checkout valid and selectable while enforcing check-in dependent minimum date
const checkinField = document.getElementById('checkin');
const checkoutField = document.getElementById('checkout');

function syncCheckoutMinDate() {
  if (!checkinField || !checkoutField) return;

  if (!checkinField.value) {
    checkoutField.min = today;
    checkoutPickr.set('minDate', today);
    updateTotal();
    return;
  }

  const checkinDate = new Date(checkinField.value);
  const minCheckout = new Date(checkinDate);
  minCheckout.setDate(minCheckout.getDate() + 1);

  checkoutField.min = minCheckout.toISOString().split('T')[0];
  checkoutPickr.set('minDate', minCheckout);

  if (checkoutField.value) {
    const checkoutDate = new Date(checkoutField.value);
    if (checkoutDate <= checkinDate) {
      checkoutField.value = '';
    }
  }

  updateTotal();
}

if (checkinField && checkoutField) {
  checkinField.addEventListener('change', () => {
    syncCheckoutMinDate();
    checkoutField.focus();
  });
  checkinField.addEventListener('input', syncCheckoutMinDate);
  syncCheckoutMinDate();
}

const galleryGrid = document.querySelector('.gallery-grid');

window.openGalleryPreview = function() {};

if (galleryGrid) {
  const galleryItems = Array.from(galleryGrid.querySelectorAll('.gallery-item img'));
  const uniqueGalleryItems = [];
  const uniqueIndexBySrc = new Map();
  galleryItems.forEach(image => {
    if (!uniqueIndexBySrc.has(image.src)) {
      uniqueIndexBySrc.set(image.src, uniqueGalleryItems.length);
      uniqueGalleryItems.push(image);
    }
  });
  const lightbox = document.getElementById('gallery-lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const prevButton = document.getElementById('lightbox-prev');
  const nextButton = document.getElementById('lightbox-next');
  const closeButton = document.getElementById('lightbox-close');
  let currentIndex = 0;
  let touchStartX = 0;

  function renderLightbox(index) {
    const normalized = (index + uniqueGalleryItems.length) % uniqueGalleryItems.length;
    currentIndex = normalized;
    const activeImage = uniqueGalleryItems[normalized];
    lightboxImage.src = activeImage.src;
    lightboxImage.alt = activeImage.alt || 'Gallery preview';
    lightboxCaption.textContent = `${normalized + 1} / ${uniqueGalleryItems.length}`;
  }

  function openLightbox(index) {
    if (!lightbox || !uniqueGalleryItems.length) return;
    renderLightbox(index);
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  window.openGalleryPreview = function(startIndex = 0) {
    openLightbox(startIndex);
  };

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImage.src = '';
    document.body.style.overflow = '';
  }

  function showNext() {
    renderLightbox(currentIndex + 1);
  }

  function showPrevious() {
    renderLightbox(currentIndex - 1);
  }

  galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      galleryGrid.classList.add('is-paused');
    });
    item.addEventListener('mouseleave', () => {
      galleryGrid.classList.remove('is-paused');
    });
  });

  galleryItems.forEach(image => {
    image.addEventListener('click', () => {
      const uniqueIndex = uniqueIndexBySrc.get(image.src) ?? 0;
      openLightbox(uniqueIndex);
    });
  });

  if (nextButton) nextButton.addEventListener('click', showNext);
  if (prevButton) prevButton.addEventListener('click', showPrevious);
  if (closeButton) closeButton.addEventListener('click', closeLightbox);

  if (lightbox) {
    lightbox.addEventListener('click', e => {
      if (e.target === lightbox) closeLightbox();
    });

    lightbox.addEventListener('touchstart', e => {
      if (!e.touches.length) return;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    lightbox.addEventListener('touchend', e => {
      if (!e.changedTouches.length) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(deltaX) < 40) return;
      if (deltaX < 0) showNext();
      if (deltaX > 0) showPrevious();
    }, { passive: true });
  }

  document.addEventListener('keydown', e => {
    if (!lightbox || !lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') showNext();
    if (e.key === 'ArrowLeft') showPrevious();
  });
}
