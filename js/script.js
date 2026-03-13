window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 80);
});

const rooms = [
  { name: 'Studio Suite', tag: 'Most Popular', price: 2200, stars: '★★★★★', meta: '2 Guests · Taal View Balcony', img: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&q=80' },
  { name: 'Cozy Studio', tag: null, price: 1800, stars: '★★★★★', meta: '2 Guests · Garden View', img: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=400&q=80' },
  { name: 'Deluxe Room', tag: 'Best View', price: 2800, stars: '★★★★★', meta: '4 Guests · Volcano Panorama', img: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=400&q=80' },
  { name: 'Romantic Suite', tag: "Couples' Pick", price: 2500, stars: '★★★★★', meta: '2 Guests · Romantic Setup', img: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=400&q=80' },
  { name: 'Barkada Room', tag: null, price: 3200, stars: '★★★★☆', meta: '6 Guests · Extra Bedding', img: 'https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=400&q=80' },
  { name: 'Budget Studio', tag: 'Sulit!', price: 1500, stars: '★★★★☆', meta: '2 Guests · City View', img: 'https://images.unsplash.com/photo-1512918728672-1763af428f95?w=400&q=80' },
];

function makeCard(r) {
  const rj = JSON.stringify(r).replace(/"/g,"'");
  return `<div class="card" onclick="openModal(${rj})">
    ${r.tag ? `<div class="card-tag">${r.tag}</div>` : ''}
    <div class="card-price">₱${r.price.toLocaleString()}<span style="font-size:.62rem;color:var(--muted)">/night</span></div>
    <img class="card-img" src="${r.img}" alt="${r.name}" loading="lazy">
    <div class="card-overlay">
      <div class="card-stars">${r.stars}</div>
      <div class="card-name">${r.name}</div>
      <div class="card-meta">${r.meta}</div>
      <div class="card-actions">
        <button class="card-btn book" onclick="event.stopPropagation();openModal(${rj})">Book</button>
        <button class="card-btn info">Details</button>
      </div>
    </div>
  </div>`;
}

document.getElementById('rooms-row').innerHTML = rooms.map(makeCard).join('');

function scrollRow(id, dir) {
  document.getElementById(id).scrollBy({ left: dir * 580, behavior: 'smooth' });
}

let currentRoom = null;
function openModal(room) {
  currentRoom = room || rooms[0];
  document.getElementById('modal-success').style.display = 'none';
  document.getElementById('modal-form').style.display = 'block';
  const priceLabel = currentRoom.flat ? `₱${currentRoom.price.toLocaleString()} flat rate` : `₱${currentRoom.price.toLocaleString()} / night`;
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
document.getElementById('modal').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });

function updateTotal() {
  if (!currentRoom) return;
  if (currentRoom.flat) { document.getElementById('total-display').textContent = '₱' + currentRoom.price.toLocaleString(); return; }
  const cin = document.getElementById('checkin').value;
  const cout = document.getElementById('checkout').value;
  if (!cin || !cout) return;
  const nights = Math.max(1, (new Date(cout) - new Date(cin)) / 86400000);
  const addon = document.getElementById('addons').value;
  let extra = addon.includes('500') ? 500 : addon.includes('350') ? 350*nights : addon.includes('200') ? 200 : 0;
  document.getElementById('total-display').textContent = '₱' + (currentRoom.price * nights + extra).toLocaleString();
}
['checkin','checkout','addons'].forEach(id => document.getElementById(id).addEventListener('change', updateTotal));

function submitBooking() {
  if (!document.getElementById('fname').value || !document.getElementById('email').value) { alert('Please fill in your name and contact details.'); return; }
  document.getElementById('modal-form').style.display = 'none';
  document.getElementById('modal-success').style.display = 'block';
}

const today = new Date().toISOString().split('T')[0];
document.getElementById('checkin').min = today;
document.getElementById('checkout').min = today;
