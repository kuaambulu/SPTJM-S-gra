'use strict';

/* Ganti dengan URL Web app hasil Deploy (berakhiran /exec). */
const API_URL = 'https://script.google.com/macros/s/ISI_ID_DEPLOYMENT/exec';

const $ = s => document.querySelector(s);
const FIELDS = [
  ['NAMA_SUAMI', 'Nama suami'], ['NIK_SUAMI', 'NIK suami'], ['ALAMAT_SUAMI', 'Alamat suami'],
  ['NAMA_ISTRI', 'Nama istri'], ['NIK_ISTRI', 'NIK istri'], ['ALAMAT_ISTRI', 'Alamat istri'],
  ['HARI_AKAD', 'Hari akad'], ['TGL_AKAD', 'Tanggal akad'], ['PENGHULU_KUA', 'Penghulu'],
  ['SAKSI1', 'Saksi 1'], ['SAKSI2', 'Saksi 2']
];
const PADS = [['SUAMI', 'Suami'], ['ISTRI', 'Istri'], ['SAKSI1', 'Saksi 1'], ['SAKSI2', 'Saksi 2']];
let noAkta = '';

/* ---------- API ---------- */
// Tanpa header Content-Type (jadi text/plain) agar browser tidak mengirim preflight CORS,
// yang tidak didukung Apps Script.
async function api(action, payload = {}) {
  const key = $('#key').value.trim();
  if (!key) throw new Error('Isi kunci akses dulu.');
  sessionStorage.setItem('sptjm_key', key);
  const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, key, ...payload }) });
  if (!res.ok) throw new Error('Server membalas ' + res.status);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Gagal tanpa keterangan');
  return j.data;
}
function status(el, msg, err) { el.textContent = msg; el.classList.toggle('er', !!err); }

/* ---------- UI awal ---------- */
$('#key').value = sessionStorage.getItem('sptjm_key') || '';
$('#fields').innerHTML = FIELDS.map(([k, l]) =>
  `<div><label for="d_${k}">${l}</label><input id="d_${k}"></div>`).join('');
$('#pads').innerHTML = PADS.map(([k, l]) =>
  `<div class="pad"><b>${l}</b><canvas id="c_${k}" width="600" height="240" tabindex="0" aria-label="Kanvas tanda tangan ${l}"></canvas><button class="o" type="button" data-c="${k}">Hapus</button></div>`).join('');

/* ---------- canvas TTD ---------- */
const sig = {};
PADS.forEach(([k]) => {
  const c = $('#c_' + k), x = c.getContext('2d');
  let on = false, p0;
  x.lineWidth = 4; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = '#0a1a4a';
  sig[k] = { c, dirty: false };
  const pt = e => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
  };
  c.onpointerdown = e => {
    on = true; c.setPointerCapture(e.pointerId); p0 = pt(e);
    x.beginPath(); x.arc(p0.x, p0.y, 2, 0, 7); x.fill(); sig[k].dirty = true; e.preventDefault();
  };
  c.onpointermove = e => {
    if (!on) return;
    const p = pt(e); x.beginPath(); x.moveTo(p0.x, p0.y); x.lineTo(p.x, p.y); x.stroke(); p0 = p;
  };
  c.onpointerup = c.onpointercancel = () => { on = false; };
});
$('#pads').onclick = e => {
  const k = e.target.dataset.c;
  if (k) { const s = sig[k]; s.c.getContext('2d').clearRect(0, 0, s.c.width, s.c.height); s.dirty = false; }
};

/* ---------- cari ---------- */
function fill(o) {
  noAkta = o.NO_AKTA;
  FIELDS.forEach(([k]) => { $('#d_' + k).value = o[k] || ''; });
  $('#res').innerHTML = '';
  const kurang = FIELDS.filter(([k]) => !o[k]).map(([, l]) => l);
  status($('#qs'), kurang.length
    ? 'Data belum lengkap di sheet: ' + kurang.join(', ') + '. Isi manual atau unggah file Excel yang kurang.'
    : 'Data terisi. Periksa sebelum membuat dokumen.');
}
async function cari() {
  const q = $('#q').value.trim(); if (!q) return;
  status($('#qs'), 'Mencari…');
  try {
    const r = await api('cari', { q });
    $('#res').innerHTML = '';
    if (!r.length) return status($('#qs'), 'Tidak ada data yang cocok. Pastikan file Excel sudah diunggah dan disinkronkan.');
    status($('#qs'), r.length + ' data ditemukan');
    if (r.length === 1) return fill(r[0]);
    r.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = `${o.NAMA_SUAMI} & ${o.NAMA_ISTRI} (${o.NO_AKTA})`;
      b.onclick = () => fill(o); $('#res').appendChild(b);
    });
  } catch (e) { status($('#qs'), 'Gagal: ' + e.message, true); }
}
$('#go').onclick = cari;
$('#q').onkeydown = e => { if (e.key === 'Enter') cari(); };

/* ---------- sinkron ---------- */
$('#sync').onclick = async () => {
  $('#sync').disabled = true; status($('#ss'), 'Memproses…');
  try { status($('#ss'), await api('sinkron')); }
  catch (e) { status($('#ss'), 'Gagal: ' + e.message, true); }
  $('#sync').disabled = false;
};

/* ---------- buat dokumen ---------- */
$('#mk').onclick = async () => {
  const d = { NO_AKTA: noAkta };
  FIELDS.forEach(([k]) => { d[k] = $('#d_' + k).value.trim(); });
  const ttd = {};
  PADS.forEach(([k]) => { if (sig[k].dirty) ttd[k] = sig[k].c.toDataURL('image/png'); });
  $('#mk').disabled = true; status($('#ms'), 'Membuat dokumen…'); $('#out').innerHTML = '';
  try {
    const r = await api('buat', { d, ttd });
    status($('#ms'), 'Dokumen dibuat.');
    $('#out').innerHTML = `<a href="${encodeURI(r.doc)}" target="_blank" rel="noopener">Buka Google Doc</a><a href="${encodeURI(r.pdf)}" target="_blank" rel="noopener">Buka PDF</a>`;
  } catch (e) { status($('#ms'), 'Gagal: ' + e.message, true); }
  $('#mk').disabled = false;
};
