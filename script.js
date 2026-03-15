window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 80);
});

const rooms = [
  { name: '1BR Skyline / City View', tag: 'Tower 4 · 21st Floor', price: 2200, weekendPrice: 2500, stars: '★★★★★', meta: '1-2 Guests · Max 4 · Queen Bed + Double Sofa Bed', img: 'images/room-bedroom-blue-curtains.jpeg' },
];

let currentRoom = null;
function openModal(room) {
  currentRoom = room || rooms[0];
  document.getElementById('modal-success').style.display = 'none';
  document.getElementById('modal-form').style.display = 'block';
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
  if (currentRoom.flat) { document.getElementById('total-display').textContent = '₱' + currentRoom.price.toLocaleString(); return; }
  const cin = document.getElementById('checkin').value;
  const cout = document.getElementById('checkout').value;
  if (!cin || !cout) {
    document.getElementById('total-display').textContent = '₱' + currentRoom.price.toLocaleString();
    return;
  }
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
  
  // Handle multiple add-ons
  const addonCheckboxes = document.querySelectorAll('.addon-checkbox:checked');
  addonCheckboxes.forEach(addon => {
    const value = addon.value;
    if (value === 'towel') extra += 50;
    if (value === 'pool-regular') extra += 150 * guestCount;
    if (value === 'pool-holiday') extra += 300 * guestCount;
    if (value === 'parking') extra += 450 * nights;
  });

  document.getElementById('total-display').textContent = '₱' + (roomTotal + extra).toLocaleString();
}
['checkin','checkout','guests'].forEach(id => {
  const field = document.getElementById(id);
  if (field) field.addEventListener('change', updateTotal);
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
  });
}

function submitBooking() {
  if (!document.getElementById('fname').value || !document.getElementById('email').value) { alert('Please fill in your name and contact details.'); return; }
  document.getElementById('modal-form').style.display = 'none';
  document.getElementById('modal-success').style.display = 'block';
}

// Auto-focus checkout when checkin is selected
const checkinField = document.getElementById('checkin');
const checkoutField = document.getElementById('checkout');
if (checkinField && checkoutField) {
  checkinField.addEventListener('change', () => {
    if (checkinField.value) {
      // Enable checkout and set minimum date to day after checkin
      checkoutField.disabled = false;
      const checkinDate = new Date(checkinField.value);
      const minCheckout = new Date(checkinDate);
      minCheckout.setDate(minCheckout.getDate() + 1);
      checkoutField.min = minCheckout.toISOString().split('T')[0];
      checkoutField.focus();
      // Update flatpickr minDate
      checkoutPickr.set('minDate', minCheckout);
    } else {
      checkoutField.disabled = true;
      checkoutField.value = '';
    }
  });
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
  theme: 'dark',
  onClose: () => {
    if (checkinField.value) checkoutField.focus();
  }
});

// Initialize Flatpickr for Check-Out
const checkoutPickr = flatpickr('#checkout', {
  minDate: today,
  maxDate: maxDate,
  dateFormat: 'Y-m-d',
  theme: 'dark',
  disabled: true
});

const galleryGrid = document.querySelector('.gallery-grid');

if (galleryGrid) {
  galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      galleryGrid.classList.add('is-paused');
    });
    item.addEventListener('mouseleave', () => {
      galleryGrid.classList.remove('is-paused');
    });
  });
}
