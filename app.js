const $ = s => document.querySelector(s);
const MAX = 200000, CONF = { l: 15, n: 55, h: 90 };
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const IMG = 'https://unpkg.com/three-globe/example/img/';
const BASE = { night: 'earth-night.jpg', day: 'earth-blue-marble.jpg' };
const STOPS = [[255,224,138],[255,138,26],[214,18,40],[122,0,25]];
let all = [], ref = 1, minY = 2000, maxY = 2025, timer = null;

const globe = Globe()($('#globe'))
  .globeImageUrl(IMG + BASE.night)
  .bumpImageUrl(IMG + 'earth-topology.png')
  .backgroundImageUrl(IMG + 'night-sky.png')
  .hexBinPointLat(d => d.lat).hexBinPointLng(d => d.lng)
  .hexBinResolution(3).hexMargin(0.2)
  .hexTopColor(h => color(h.sumWeight)).hexSideColor(h => color(h.sumWeight))
  .hexAltitude(h => 0.005 + 0.14 * level(h.sumWeight))
  .hexLabel(h => `${h.sumWeight} detections`)
  .onHexClick(showInfo);
globe.controls().autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
globe.controls().autoRotateSpeed = 0.4;
const fit = () => globe.width(innerWidth).height(innerHeight);
addEventListener('resize', fit); fit();

function level(w) { return Math.min(1, Math.log(1 + w) / Math.log(1 + ref)); }
function color(w) {
  const x = level(w) * (STOPS.length - 1), i = Math.min(Math.floor(x), STOPS.length - 2), f = x - i;
  return `rgb(${STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f))})`;
}

function parse(txt) {
  const L = txt.trim().split(/\r?\n/), h = L[0].split(',').map(s => s.trim());
  const ix = n => h.indexOf(n);
  const [la, lo, dt, fr, ins, cf] = ['latitude','longitude','acq_date','frp','instrument','confidence'].map(ix);
  if (la < 0 || lo < 0 || dt < 0) throw new Error('This file is missing latitude, longitude or acq_date columns.');
  const step = Math.max(1, Math.ceil((L.length - 1) / MAX)), out = [];
  for (let i = 1; i < L.length; i += step) {
    const r = L[i].split(',');
    const lat = +r[la], lng = +r[lo], y = +r[dt].slice(0, 4);
    if (isNaN(lat) || isNaN(lng) || isNaN(y)) continue;
    const c = CONF[(r[cf] || '').trim()] ?? +r[cf];
    out.push({ lat, lng, y, m: +r[dt].slice(5, 7), frp: +r[fr] || 0,
      ins: (r[ins] || '').trim() === 'VIIRS' ? 'VIIRS' : 'MODIS', conf: isNaN(c) ? 100 : c });
  }
  if (!out.length) throw new Error('No valid rows found in this file.');
  return out;
}

async function load(file) {
  $('#err').textContent = '';
  try {
    all = parse(await file.text());
  } catch (e) { $('#err').textContent = e.message; return; }
  minY = Math.min(...all.map(p => p.y)); maxY = Math.max(...all.map(p => p.y));
  const yr = $('#year'); yr.min = minY; yr.max = maxY; yr.value = maxY;
  $('#drop').hidden = false; $('#drop').style.display = 'none';
  ['#controls', '#timeline'].forEach(s => $(s).hidden = false);
  $('#info').hidden = true;
  draw();
}

function filtered() {
  const end = +$('#year').value, cum = $('#cum').checked, mc = +$('#conf').value;
  const on = { MODIS: $('#modis').checked, VIIRS: $('#viirs').checked };
  return all.filter(p => on[p.ins] && p.conf >= mc && p.y <= end && (cum || p.y === end));
}

function draw() {
  const d = filtered(), cells = new Map();
  d.forEach(p => { const k = Math.floor(p.lat) + ',' + Math.floor(p.lng); cells.set(k, (cells.get(k) || 0) + 1); });
  ref = Math.max(1, ...cells.values());
  globe.hexBinPointsData(d);
  $('#count').textContent = d.length.toLocaleString();
  const y = $('#year').value;
  $('#yl').textContent = $('#cum').checked && +y > minY ? `${minY}–${y}` : y;
}

function showInfo(h) {
  globe.controls().autoRotate = false;
  const pts = h.points, byY = {}, byM = Array(12).fill(0);
  pts.forEach(p => { byY[p.y] = (byY[p.y] || 0) + 1; byM[p.m - 1]++; });
  const years = []; for (let y = minY; y <= maxY; y++) years.push(byY[y] || 0);
  const top = Math.max(...years, 1), peak = byM.indexOf(Math.max(...byM));
  const frp = pts.reduce((s, p) => s + p.frp, 0) / pts.length;
  const c = h.center || pts[0];
  $('#infobody').innerHTML = `
    <h2>Area near ${(+c.lat).toFixed(1)}°, ${(+c.lng).toFixed(1)}°</h2>
    <div class="stats"><div><b>${pts.length.toLocaleString()}</b>detections</div>
      <div><b>${MON[peak]}</b>busiest month</div><div><b>${frp.toFixed(1)}</b>avg MW</div></div>
    <p class="hint">Detections per year</p>
    <div class="bars">${years.map(n => `<i style="height:${Math.max(3, n / top * 100)}%" title="${n}"></i>`).join('')}</div>
    <div class="axis"><span>${minY}</span><span>${maxY}</span></div>`;
  $('#info').hidden = false;
}

$('#pick').onclick = $('#again').onclick = () => $('#file').click();
$('#file').onchange = e => e.target.files[0] && load(e.target.files[0]);
addEventListener('dragover', e => { e.preventDefault(); $('#drop').classList.add('over'); });
addEventListener('dragleave', () => $('#drop').classList.remove('over'));
addEventListener('drop', e => {
  e.preventDefault(); $('#drop').classList.remove('over');
  const f = e.dataTransfer.files[0]; if (f) { $('#drop').style.display = ''; load(f); }
});
$('#close').onclick = () => $('#info').hidden = true;
['#modis', '#viirs', '#conf', '#cum', '#year'].forEach(s => $(s).addEventListener('input', draw));
$('#base').onchange = e => globe.globeImageUrl(IMG + BASE[e.target.value]);
$('#play').onclick = () => {
  if (timer) { clearInterval(timer); timer = null; $('#play').textContent = 'Play'; return; }
  $('#play').textContent = 'Pause';
  timer = setInterval(() => {
    const y = $('#year'); y.value = +y.value >= maxY ? minY : +y.value + 1; draw();
  }, 900);
};
