window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 80);
});

const rooms = [
  { name: '1BR Skyline / City View', tag: 'Tower 4 · 21st Floor', price: 2200, weekendPrice: 2500, stars: '★★★★★', meta: '1-2 Guests · Max 4 · Queen Bed + Double Sofa Bed', img: 'images/room-bedroom-blue-curtains.jpg' },
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
  const addon = document.getElementById('addons').value;
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
  if (addon === 'towel') extra += 50;
  if (addon === 'pool-regular') extra += 150 * guestCount;
  if (addon === 'pool-holiday') extra += 300 * guestCount;
  if (addon === 'parking') extra += 450 * nights;

  document.getElementById('total-display').textContent = '₱' + (roomTotal + extra).toLocaleString();
}
['checkin','checkout','addons','guests'].forEach(id => {
  const field = document.getElementById(id);
  if (field) field.addEventListener('change', updateTotal);
});

function submitBooking() {
  if (!document.getElementById('fname').value || !document.getElementById('email').value) { alert('Please fill in your name and contact details.'); return; }
  document.getElementById('modal-form').style.display = 'none';
  document.getElementById('modal-success').style.display = 'block';
}

const today = new Date().toISOString().split('T')[0];
const checkin = document.getElementById('checkin');
const checkout = document.getElementById('checkout');
if (checkin) checkin.min = today;
if (checkout) checkout.min = today;

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
