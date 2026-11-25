{
const $ = (id) => document.getElementById(id);
const DEF = { mode: 'drive', speed: 50, Cp: 0.6, fan: true, fanP: 200, fanQ: 0.2, Vface: 5, TaIn: 35, alt: 990, TcIn: 60, flow: 10, cool: 'water', load: 2.0,
  theta: 27, Fp: 1.5, Lp: 1.2, Fl: 8, df: 0.1, W: 235, H: 114.3, D: 50.8, Th: 1.8, tw: 0.3 };
let S = { ...DEF }, units = 'si';
try { const sv = JSON.parse(localStorage.getItem('radlab.v1') || 'null'); if (sv && sv.S) { S = { ...DEF, ...sv.S }; units = sv.units === 'us' ? 'us' : 'si'; } } catch (e) {}
const save = () => { try { localStorage.setItem('radlab.v1', JSON.stringify({ S, units })); } catch (e) {} };

// ---------- units ----------
const id_ = (v) => v;
const Q = {
  temp: { si: ['°C', id_, id_], us: ['°F', (v) => v * 9 / 5 + 32, (v) => (v - 32) * 5 / 9] },
  dT: { si: ['°C', id_, id_], us: ['°F', (v) => v * 9 / 5, (v) => v * 5 / 9] },
  spd: { si: ['km/h', id_, id_], us: ['mph', (v) => v / 1.609344, (v) => v * 1.609344] },
  len: { si: ['mm', id_, id_], us: ['in', (v) => v / 25.4, (v) => v * 25.4] },
  flowL: { si: ['L/min', id_, id_], us: ['gpm', (v) => v / 3.78541, (v) => v * 3.78541] },
  press: { si: ['Pa', id_, id_], us: ['inH₂O', (v) => v / 249.089, (v) => v * 249.089] },
  kpa: { si: ['kPa', (v) => v / 1000, (v) => v * 1000], us: ['psi', (v) => v / 6894.76, (v) => v * 6894.76] },
  vel: { si: ['m/s', id_, id_], us: ['ft/s', (v) => v * 3.28084, (v) => v / 3.28084] },
  vflow: { si: ['m³/h', (v) => v * 3600, (v) => v / 3600], us: ['CFM', (v) => v * 2118.88, (v) => v / 2118.88] },
  kw: { si: ['kW', id_, id_], us: ['kW', id_, id_] },
  deg: { si: ['°', id_, id_], us: ['°', id_, id_] },
  none: { si: ['', id_, id_], us: ['', id_, id_] }
};
const conv = (q, v) => Q[q][units][1](v), unconv = (q, v) => Q[q][units][2](v), uname = (q) => Q[q][units][0];
const fx = (v, d) => (Math.abs(v) < 1e-9 ? 0 : v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const F = (q, v, dSI, dUS) => fx(conv(q, v), units === 'si' ? dSI : (dUS ?? dSI)) + (uname(q) ? (uname(q).startsWith('°') ? '' : ' ') + uname(q) : '');

// ---------- controls ----------
const isDrive = () => S.mode === 'drive';
const C = [
  { id: 'speed', g: 'air', l: 'Vehicle speed', q: 'spd', min: 0, max: 130, step: 1, d: [0, 0], show: isDrive },
  { id: 'Cp', g: 'air', l: 'Duct pressure recovery', q: 'none', min: 0.1, max: 0.95, step: 0.01, d: [2, 2], show: isDrive, sub: 'Share of the car’s dynamic pressure that reaches the core face' },
  { id: 'fan', g: 'air', type: 'toggle', l: 'Radiator fan', show: isDrive },
  { id: 'fanP', g: 'air', l: 'Fan shutoff pressure', q: 'press', min: 40, max: 600, step: 5, d: [0, 2], show: () => isDrive() && S.fan },
  { id: 'fanQ', g: 'air', l: 'Fan free-air flow', q: 'vflow', min: 0.03, max: 0.6, step: 0.005, d: [0, 0], show: () => isDrive() && S.fan, sub: 'Example fan curve: enter your fan’s datasheet values' },
  { id: 'Vface', g: 'air', l: 'Face velocity', q: 'vel', min: 0.3, max: 15, step: 0.1, d: [1, 1], show: () => !isDrive() },
  { id: 'TaIn', g: 'air', l: 'Ambient air', q: 'temp', min: 5, max: 48, step: 0.5, d: [1, 0] },
  { id: 'alt', g: 'air', type: 'select', l: 'Site', opts: [[990, 'Lubbock, TX (990 m)'], [300, 'Michigan Intl. Speedway (about 300 m)'], [0, 'Sea level'], [1610, 'Denver, CO (1,610 m)']] },
  { id: 'TcIn', g: 'cool', l: 'Coolant into radiator', q: 'temp', min: 30, max: 95, step: 0.5, d: [1, 0] },
  { id: 'flow', g: 'cool', l: 'Coolant flow', q: 'flowL', min: 1, max: 30, step: 0.5, d: [1, 2] },
  { id: 'cool', g: 'cool', type: 'select', l: 'Coolant', opts: [['water', 'Water'], ['eg50', '50/50 glycol (comparison only)']] },
  { id: 'load', g: 'cool', l: 'Heat load to reject', q: 'kw', min: 0.2, max: 12, step: 0.1, d: [1, 1], sub: 'Motor + inverter losses you need this radiator to carry' },
  { id: 'theta', g: 'fins', l: 'Louver angle', q: 'deg', min: 12, max: 36, step: 0.5, d: [1, 1] },
  { id: 'Fp', g: 'fins', l: 'Fin pitch', q: 'len', min: 0.8, max: 3, step: 0.05, d: [2, 3], sub: () => fx(25.4 / S.Fp, 1) + ' fins per inch' },
  { id: 'Lp', g: 'fins', l: 'Louver pitch', q: 'len', min: 0.7, max: 2, step: 0.05, d: [2, 3] },
  { id: 'Fl', g: 'fins', l: 'Fin height (tube gap)', q: 'len', min: 4, max: 12, step: 0.1, d: [1, 3] },
  { id: 'df', g: 'fins', l: 'Fin thickness', q: 'len', min: 0.05, max: 0.2, step: 0.005, d: [3, 4] },
  { id: 'W', g: 'core', l: 'Core width (tube length)', q: 'len', min: 100, max: 600, step: 1, d: [0, 2] },
  { id: 'H', g: 'core', l: 'Core height', q: 'len', min: 60, max: 400, step: 0.5, d: [1, 2] },
  { id: 'D', g: 'core', l: 'Core depth (airflow)', q: 'len', min: 16, max: 80, step: 0.5, d: [1, 2] },
  { id: 'Th', g: 'core', l: 'Tube height', q: 'len', min: 1, max: 3, step: 0.05, d: [2, 3] },
  { id: 'tw', g: 'core', l: 'Tube wall', q: 'len', min: 0.15, max: 0.5, step: 0.01, d: [2, 3] }
];
const TABS = [['air', 'Air'], ['cool', 'Coolant'], ['fins', 'Fins'], ['core', 'Core']];
let tab = 'air';
const rows = {}; // id -> [row elements]
function makeRow(c) {
  const el = document.createElement('div');
  if (c.type === 'toggle') {
    el.className = 'toggle';
    el.innerHTML = `<label for="tg_${c.id}_${Math.random().toString(36).slice(2, 6)}">${c.l}</label><button class="sw" aria-label="${c.l}"></button>`;
    const b = el.querySelector('button'); b.id = el.querySelector('label').htmlFor;
    b.addEventListener('click', () => { S[c.id] = !S[c.id]; changed(c.id); });
    el.sync = () => b.setAttribute('aria-pressed', S[c.id] ? 'true' : 'false');
  } else if (c.type === 'select') {
    el.className = 'row';
    const sid = 'sel_' + c.id + Math.random().toString(36).slice(2, 6);
    el.innerHTML = `<label for="${sid}">${c.l}</label><span></span><select id="${sid}" style="grid-column:1/-1">${c.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const s = el.querySelector('select');
    s.addEventListener('change', () => { S[c.id] = typeof c.opts[0][0] === 'number' ? +s.value : s.value; changed(c.id); });
    el.sync = () => { s.value = String(S[c.id]); };
  } else {
    el.className = 'row';
    const nid = 'n_' + c.id + Math.random().toString(36).slice(2, 6);
    el.innerHTML = `<label for="${nid}">${c.l}</label><div class="num"><input id="${nid}" inputmode="decimal" autocomplete="off"><em></em></div><input type="range" aria-label="${c.l}" min="${c.min}" max="${c.max}" step="${c.step}">${c.sub ? '<div class="sub"></div>' : ''}`;
    const num = el.querySelector('.num input'), rng = el.querySelector('input[type=range]'), em = el.querySelector('em'), sub = el.querySelector('.sub');
    rng.addEventListener('input', () => { S[c.id] = +rng.value; changed(c.id, el); });
    const commit = () => {
      let v = parseFloat(num.value.replace(/,/g, ''));
      if (!isFinite(v)) { el.sync(); return; }
      v = unconv(c.q, v); v = Math.max(c.min, Math.min(c.max, v));
      S[c.id] = v; changed(c.id);
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); num.blur(); } });
    el.sync = (skipNum) => {
      rng.value = S[c.id];
      rng.style.setProperty('--p', ((S[c.id] - c.min) / (c.max - c.min) * 100).toFixed(1) + '%');
      if (document.activeElement !== num) num.value = fx(conv(c.q, S[c.id]), units === 'si' ? c.d[0] : c.d[1]).replace(/,/g, '');
      em.textContent = uname(c.q);
      if (sub) sub.textContent = typeof c.sub === 'function' ? c.sub() : c.sub;
    };
  }
  el.def = c;
  (rows[c.id] = rows[c.id] || []).push(el);
  return el;
}
function buildTabs() {
  $('tabs').innerHTML = TABS.map(([k, t]) => `<button role="tab" data-t="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; buildTabs(); renderCtl(); }));
}
const ctlEls = C.map((c) => makeRow(c));
const modeEl = document.createElement('div');
modeEl.className = 'seg'; modeEl.setAttribute('role', 'group'); modeEl.setAttribute('aria-label', 'Airflow source');
modeEl.innerHTML = '<button data-m="drive">Drive it</button><button data-m="tunnel">Wind tunnel</button>';
modeEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.mode = b.dataset.m; changed('mode'); }));
function renderCtl() {
  const box = $('ctl'); box.innerHTML = '';
  if (tab === 'air') box.appendChild(modeEl);
  ctlEls.forEach((el) => { if (el.def.g === tab && (!el.def.show || el.def.show())) box.appendChild(el); });
  syncAll();
}
const miniIds = ['theta', 'Fp', 'Lp'];
function renderMini() {
  const box = $('miniCtl'); box.innerHTML = '';
  for (const id of [...miniIds, isDrive() ? 'speed' : 'Vface']) box.appendChild(makeRowCached(id));
  syncAll();
}
const miniCache = {};
function makeRowCached(id) { return miniCache[id] || (miniCache[id] = makeRow(C.find((c) => c.id === id))); }
function syncAll() {
  for (const id in rows) for (const el of rows[id]) el.sync();
  modeEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === S.mode));
  $('uSI').setAttribute('aria-pressed', units === 'si'); $('uUS').setAttribute('aria-pressed', units === 'us');
}

// ---------- presets ----------
const PRE = [
  ['Endurance at Michigan', { mode: 'drive', speed: 55, fan: true, TaIn: 29, alt: 300, TcIn: 60, flow: 12, load: 3 }],
  ['Lubbock autocross, July', { mode: 'drive', speed: 45, fan: true, TaIn: 38, alt: 990, TcIn: 62, flow: 12, load: 2.5 }],
  ['Pit lane, fan only', { mode: 'drive', speed: 0, fan: true, TaIn: 35, alt: 990 }],
  ['Wind tunnel, 5 m/s', { mode: 'tunnel', Vface: 5 }]
];
$('presets').innerHTML = PRE.map(([n], i) => `<button class="btn" data-p="${i}">${n}</button>`).join('');
$('presets').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { Object.assign(S, PRE[+b.dataset.p][1]); changed('preset'); }));

// ---------- 3D ----------
const R3 = new Radiator3D($('gl'), $('labels'));
if (!R3.ok) { $('noGL').hidden = false; $('labels').hidden = true; }
const segBtn = (a, b, on) => { $(a).setAttribute('aria-pressed', on); if (b) $(b).setAttribute('aria-pressed', !on); };
$('vStudio').onclick = () => { R3.thermal = 0; segBtn('vStudio', 'vThermal', true); };
$('vThermal').onclick = () => { R3.thermal = 1; segBtn('vThermal', 'vStudio', true); };
$('vCut').onclick = () => { R3.cutaway = !R3.cutaway; segBtn('vCut', null, R3.cutaway); };
$('vAir').onclick = () => { R3.showAir = !R3.showAir; segBtn('vAir', null, R3.showAir); };
$('vSpin').onclick = () => { R3.autoSpin = !R3.autoSpin; segBtn('vSpin', null, R3.autoSpin); };
$('vEx').onclick = () => { R3.explode = R3.explode ? 0 : 1; segBtn('vEx', null, !!R3.explode); };
R3.onSpin = (v) => segBtn('vSpin', null, v);
$('uSI').onclick = () => { units = 'si'; changed('units'); };
$('uUS').onclick = () => { units = 'us'; changed('units'); };

// ---------- solve ----------
let P = null, R = null, lastGeoKey = '';
function solve() {
  const p = { ...S };
  const V = operatingPoint(p);
  p.Vface = V; p.VfaceSolved = V;
  R = solveRadiator(p); P = p;
  // equilibrium inlet temperature for the load (UA and capacities nearly independent of temperature)
  const perK = R.Q / Math.max(0.01, p.TcIn - p.TaIn);
  R.Teq = p.TaIn + p.load * 1000 / Math.max(1e-6, perK);
  R.perK = perK;
}
function show() {
  const p = P, r = R, kW = r.Q / 1000;
  const sp = isDrive() ? F('spd', p.speed, 0) : F('vel', p.Vface, 1) + ' face velocity';
  $('title').textContent = isDrive()
    ? `At ${F('spd', p.speed, 0)}${p.fan ? ' with the fan on' : ', fan off'}, this core rejects ${fx(kW, 2)} kW`
    : `At ${F('vel', p.Vface, 1)} through the face, this core rejects ${fx(kW, 2)} kW`;
  const pct = kW / p.load * 100;
  if (p.TcIn - p.TaIn < 0.5) {
    $('title').textContent = 'The coolant is no hotter than the air, so nothing is rejected';
    $('lede').textContent = 'Raise the coolant temperature or lower the ambient temperature to see the radiator work.';
  } else $('lede').innerHTML = (pct >= 100
    ? `Enough for your <b>${fx(p.load, 1)} kW</b> heat load with <b>${fx(pct - 100, 0)}% margin</b>. `
    : `That is <b>${fx(pct, 0)}%</b> of your <b>${fx(p.load, 1)} kW</b> heat load, so the loop would heat up until the coolant reaches about <b>${F('temp', r.Teq, 0)}</b> at the radiator inlet. `)
    + `Coolant leaves at <b>${F('temp', r.TcOut, 1)}</b> and the air leaves <b>${F('dT', r.TaOut - p.TaIn, 1)}</b> warmer.`;
  $('bQ').innerHTML = `${fx(kW, 2)}<small>kW</small>`;
  const scale = Math.max(kW, p.load) * 1.15;
  $('mQ').style.width = (kW / scale * 100).toFixed(1) + '%'; $('mL').style.left = (p.load / scale * 100).toFixed(1) + '%';
  $('stat').innerHTML = p.TcIn - p.TaIn < 0.5 ? 'No temperature difference to drive heat out' : pct >= 100 ? `<b class="good">Holds the ${fx(p.load, 1)} kW load</b> at ${F('temp', p.TcIn, 0)} inlet · ${units === 'us' ? fx(r.perK / 1.8, 0) + ' W per °F' : fx(r.perK, 0) + ' W per °C'} of inlet temperature difference`
    : `<b class="bad">Short ${fx(p.load - kW, 2)} kW</b> at ${F('temp', p.TcIn, 0)} inlet · settles near ${F('temp', r.Teq, 0)}`;
  $('fTc').textContent = F('temp', r.TcOut, 1); $('fTa').textContent = F('temp', r.TaOut, 1);
  $('fV').textContent = F('vel', p.Vface, 2); $('fdP').textContent = F('press', r.dPair, 0, 2);
  $('fE').textContent = fx(r.eps, 2); $('fdPc').textContent = F('kpa', r.dPcool, 2, 2);
  $('sQ').textContent = fx(kW, 2) + ' kW'; $('sT').textContent = F('temp', r.TcOut, 1);
  $('lIn').textContent = F('temp', p.TcIn, 1); $('lOut').textContent = F('temp', r.TcOut, 1);
  $('lAir').textContent = F('temp', p.TaIn, 1); $('lVel').textContent = F('vel', p.Vface, 1); $('lExh').textContent = F('temp', r.TaOut, 1);
  $('cLo').textContent = F('temp', p.TaIn, 0); $('cHi').textContent = F('temp', p.TcIn, 0);
  $('coreChip').textContent = units === 'us' ? `${fx(p.W / 25.4, 2)} × ${fx(p.H / 25.4, 2)} × ${fx(p.D / 25.4, 2)} in core` : `${fx(p.W, 0)} × ${fx(p.H, 0)} × ${fx(p.D, 1)} mm core`;
  if (R3.ok) { R3.fanOn = isDrive() && p.fan; R3.setModel(p, r); }
  tables(); flags(); deltas();
}

// ---------- baseline compare ----------
let base = null;
try { base = JSON.parse(localStorage.getItem('radlab.base') || 'null'); } catch (e) {}
function deltas() {
  const r = R, p = P;
  const cur = { Q: r.Q, TcOut: r.TcOut, TaOut: r.TaOut, V: p.Vface, dP: r.dPair, eps: r.eps, dPc: r.dPcool };
  const set = (id, txt, good) => { const e = $(id); e.textContent = txt; e.className = txt ? (good ? 'up' : 'dn') : ''; };
  if (!base) { for (const k of ['fTc', 'fTa', 'fV', 'fdP', 'fE', 'fdPc']) set(k + 'd', ''); $('pin').textContent = 'Pin as baseline'; $('pinNote').textContent = 'Pin a design, then change anything to compare.'; return; }
  const sg = (v, d) => (v >= 0 ? '+' : '−') + fx(Math.abs(v), d);
  const dq = (cur.Q - base.Q) / 1000;
  $('pin').textContent = 'Clear baseline';
  $('pinNote').innerHTML = `vs baseline: <b style="color:${dq >= 0 ? 'var(--ok)' : '#ff6a6f'}">${sg(dq, 2)} kW</b> (${sg(dq / (base.Q / 1000) * 100, 1)}%)`;
  const dT = (v) => units === 'us' ? v * 1.8 : v, tu = units === 'us' ? '°F' : '°C';
  set('fTcd', sg(dT(cur.TcOut - base.TcOut), 1) + tu, cur.TcOut <= base.TcOut);
  set('fTad', sg(dT(cur.TaOut - base.TaOut), 1) + tu, cur.TaOut >= base.TaOut);
  set('fVd', sg(conv('vel', cur.V) - conv('vel', base.V), 2) + ' ' + uname('vel'), cur.V >= base.V);
  set('fdPd', sg((cur.dP - base.dP) / base.dP * 100, 0) + '%', cur.dP <= base.dP);
  set('fEd', sg(cur.eps - base.eps, 3), cur.eps >= base.eps);
  set('fdPcd', sg((cur.dPc - base.dPc) / base.dPc * 100, 0) + '%', cur.dPc <= base.dPc);
}
$('pin').onclick = () => {
  base = base ? null : { Q: R.Q, TcOut: R.TcOut, TaOut: R.TaOut, V: P.Vface, dP: R.dPair, eps: R.eps, dPc: R.dPcool };
  try { localStorage.setItem('radlab.base', JSON.stringify(base)); } catch (e) {}
  deltas();
};

// ---------- tables & flags ----------
function tables() {
  const p = P, r = R;
  const T = [
    ['Geometry', [['Tubes / fin rows', `${r.N} / ${r.rows}`], ['Fins per row', fx(r.nf, 0) + ` (${fx(25.4 / p.Fp, 1)} FPI)`], ['Frontal area', fx(r.Afr * 1e4, 1) + ' cm²'], ['Free-flow ratio σ', fx(r.sigma, 3)],
      ['Air-side area (fins + tubes)', fx(r.A, 2) + ' m²'], ['Fin share of area', fx(r.Afin / r.A * 100, 0) + '%'], ['Air hydraulic diameter', F('len', r.Dh * 1000, 2, 3)], ['Coolant-side area', fx(r.Ai, 3) + ' m²']]],
    ['Air side', [['Air density', fx(r.air.rho, 3) + ' kg/m³'], ['Site pressure', fx(r.P / 1000, 1) + ' kPa'], ['Mass flow', fx(r.mA * 1000, 1) + ' g/s'], ['Face / core velocity', `${F('vel', p.Vface, 2)} / ${F('vel', r.Vc, 2)}`],
      ['Re (louver pitch)', fx(r.ReLp, 0)], ['Colburn j', fx(r.j, 4)], ['Fanning f', fx(r.f, 3)], ['h, air', fx(r.hA, 0) + ' W/m²K'], ['Fin efficiency / surface eff.', `${fx(r.etaF, 3)} / ${fx(r.eta0, 3)}`],
      ['Core ΔP', F('press', r.dPair, 0, 2)], ['Air power through core', fx(r.airPower, 1) + ' W']]],
    ['Coolant side', [['Mass flow', fx(p.flow / 60000 * r.rhoC * 1000, 0) + ' g/s'], ['Velocity in tubes', F('vel', r.Vi, 3, 2)], ['Reynolds number', fx(r.Rei, 0) + (r.Rei < 2300 ? ' (laminar)' : r.Rei < 4000 ? ' (transitional)' : ' (turbulent)')],
      ['Nusselt number', fx(r.Nui, 2)], ['h, coolant', fx(r.hi, 0) + ' W/m²K'], ['Tube hydraulic diameter', F('len', r.Dhi * 1000, 2, 3)], ['Core ΔP', F('kpa', r.dPcool, 2, 2)]]],
    ['Overall', [['UA', fx(r.UA, 1) + ' W/K'], ['NTU / Cr', `${fx(r.NTU, 2)} / ${fx(r.Cr, 3)}`], ['Effectiveness ε', fx(r.eps, 3)], ['Air resistance share', fx((1 / (r.eta0 * r.hA * r.A)) / (1 / r.UA) * 100, 0) + '%'],
      ['Heat rejected', fx(r.Q / 1000, 3) + ' kW'], ['Per degree of inlet temp. difference', units === 'us' ? fx(r.perK / 1.8, 1) + ' W/°F' : fx(r.perK, 1) + ' W/°C'], ['Coolant out', F('temp', r.TcOut, 2)], ['Air out, mean', F('temp', r.TaOut, 2)], ['Inlet temp to carry load', F('temp', r.Teq, 1)]]]
  ];
  $('tables').innerHTML = T.map(([h, rs]) => `<div class="card"><h3 style="margin-bottom:8px">${h}</h3><table><tbody>${rs.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</tbody></table></div>`).join('');
}
function flags() {
  const p = P, r = R, out = [];
  if (r.ReLp < 100 || r.ReLp > 3000) out.push(`Re<sub>Lp</sub> = ${fx(r.ReLp, 0)} is outside the 100–3,000 range the j correlation was fitted on; heat transfer is extrapolated.`);
  if (r.ReLp < 100 || r.ReLp > 600 || p.theta < 15 || p.theta > 29) out.push('Louver angle or Re<sub>Lp</sub> is outside the approximate test range of the friction correlation (about 15–29°, Re 100–600), so ΔP is less certain.');
  if (p.D > 24) out.push(`Your ${F('len', p.D, 1, 2)} core is deeper than the approximately 16–24 mm cores behind the friction correlation; treat ΔP (and the solved airflow) as an estimate.`);
  if (r.Rei > 2300 && r.Rei < 4000) out.push('Coolant flow is transitional (Re 2,300–4,000); the coolant-side coefficient is blended and uncertain.');
  if (p.Fp / p.Lp < 0.6 || p.Fp / p.Lp > 2.2) out.push('Fin-to-louver pitch ratio is unusual for production louvered fins.');
  if (p.cool === 'eg50') out.push('Glycol is shown for comparison. Check the current FSAE rules for what coolant your car may run.');
  if (!out.length) out.push('All inputs sit inside the correlations’ typical ranges.');
  $('flags').innerHTML = out.map((t, i) => `<div class="flag${out.length === 1 && t.startsWith('All') ? ' okf' : ''}">${t}</div>`).join('');
}

// ---------- charts ----------
function chart(svg, cfg) {
  svg._cfg = cfg;
  if (!svg._ro) { svg._ro = new ResizeObserver(() => drawChart(svg)); svg._ro.observe(svg); }
  drawChart(svg);
}
function drawChart(svg) {
  const c = svg._cfg; if (!c) return;
  const W = svg.clientWidth, H = svg.clientHeight; if (!W || !H) return;
  const m = { l: 46, r: 16, t: 14, b: 38 };
  const xs = c.xs, allY = c.series.flatMap((s) => s.ys).concat(c.hline != null ? [c.hline] : []);
  let y0 = c.y0 ?? Math.min(0, ...allY), y1 = Math.max(...allY) * 1.12; if (y1 <= y0) y1 = y0 + 1;
  const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
  const ys = nice((y1 - y0) / 4);
  y1 = Math.ceil(y1 / ys) * ys; y0 = Math.floor(y0 / ys) * ys;
  const X = (v) => m.l + (v - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - m.l - m.r), Y = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  let s = '';
  for (let v = y0; v <= y1 + 1e-9; v += ys) s += `<line class="ax" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke-opacity=".6"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${c.yfmt ? c.yfmt(v) : fx(v, ys < 1 ? 1 : 0)}</text>`;
  const xt = c.xticks || xs.filter((_, i) => i % Math.ceil(xs.length / (W < 420 ? 4 : 7)) === 0);
  for (const v of xt) s += `<text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle">${c.xfmt ? c.xfmt(v) : fx(v, 0)}</text>`;
  s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end">${c.xl}</text>`;
  if (c.hline != null) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(c.hline)}" y2="${Y(c.hline)}" stroke="#e9eef4" stroke-dasharray="5 5" stroke-width="1.2"/><text x="${m.l + 6}" y="${Y(c.hline) - 7}" style="fill:#e9eef4">${c.hlabel}</text>`;
  for (const sr of c.series) {
    const d = sr.ys.map((v, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
    if (sr.area) s += `<path d="${d}L${X(xs[xs.length - 1])} ${Y(y0)}L${X(xs[0])} ${Y(y0)}Z" fill="${sr.color}" fill-opacity=".12"/>`;
    s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${sr.w || 2.5}" stroke-linejoin="round"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ''}/>`;
    if (sr.start) { s += `<text x="${X(xs[0]) + 6}" y="${Y(sr.ys[0]) + (sr.ys[0] >= Math.max(...c.series.map((q) => q.ys[0])) ? -9 : 19)}" style="fill:${sr.color}">${sr.name}</text>`; continue; }
    const li = sr.labelAt ?? sr.ys.length - 1;
    s += `<text x="${Math.min(W - m.r - 4, X(xs[li]))}" y="${Y(sr.ys[li]) + (sr.below ? 19 : -9)}" text-anchor="end" style="fill:${sr.color}">${sr.name}</text>`;
  }
  if (c.mark) s += `<circle cx="${X(c.mark[0])}" cy="${Y(c.mark[1])}" r="7" fill="#ef2b36" stroke="#0b0e13" stroke-width="3"/>`;
  if (c.best) s += `<line x1="${X(c.best)}" x2="${X(c.best)}" y1="${m.t}" y2="${H - m.b}" stroke="#3ccf91" stroke-dasharray="3 4"/>`;
  svg.innerHTML = s;
}
const qAt = (over) => { const p = { ...S, ...over }; const V = operatingPoint(p); return solveRadiator({ ...p, Vface: V, quick: true }); };
function charts() {
  const p = P;
  if (isDrive()) {
    const xs = []; for (let v = 0; v <= 130; v += 5) xs.push(v);
    const on = xs.map((v) => qAt({ speed: v, fan: true }).Q / 1000), off = xs.map((v) => qAt({ speed: v, fan: false }).Q / 1000);
    const cross = (arr) => { const i = arr.findIndex((q) => q >= p.load); return i < 0 ? null : xs[i]; };
    const a = cross(on), b = cross(off);
    $('c1t').textContent = 'Heat rejected vs vehicle speed';
    $('c1n').textContent = `Fan on, it carries ${fx(p.load, 1)} kW ${a === null ? 'at no speed up to ' + F('spd', 130, 0) : a === 0 ? 'even standing still' : 'from about ' + F('spd', a, 0)}; fan off, ${b === null ? 'never below ' + F('spd', 130, 0) : 'from about ' + F('spd', b, 0)}. Coolant held at ${F('temp', p.TcIn, 0)} inlet.`;
    chart($('c1'), { xs: xs.map((v) => conv('spd', v)), series: [{ ys: off, color: '#9aa7b8', name: 'fan off', w: 2, below: true }, { ys: on, color: '#ef2b36', name: 'fan on', area: true }], hline: p.load, hlabel: `heat load ${fx(p.load, 1)} kW`, mark: [conv('spd', p.speed), R.Q / 1000], xl: uname('spd'), yfmt: (v) => fx(v, 1) });
  } else {
    const xs = []; for (let v = 0.5; v <= 15.01; v += 0.5) xs.push(v);
    const q = xs.map((v) => solveRadiator({ ...S, Vface: v, quick: true }).Q / 1000);
    const i = q.findIndex((x) => x >= p.load);
    $('c1t').textContent = 'Heat rejected vs face velocity';
    $('c1n').textContent = i < 0 ? `Never reaches ${fx(p.load, 1)} kW below ${F('vel', 15, 0)} at this inlet temperature.` : `Needs about ${F('vel', xs[i], 1)} through the face to carry ${fx(p.load, 1)} kW.`;
    chart($('c1'), { xs: xs.map((v) => conv('vel', v)), series: [{ ys: q, color: '#ef2b36', name: 'heat rejected', area: true }], hline: p.load, hlabel: `heat load ${fx(p.load, 1)} kW`, mark: [conv('vel', p.Vface), R.Q / 1000], xl: uname('vel'), yfmt: (v) => fx(v, 1) });
  }
  // louver angle sweep
  const th = []; for (let t = 15; t <= 35; t += 1) th.push(t);
  const thr = th.map((t) => qAt({ theta: t }));
  const q0 = R.Q, d0 = R.dPair;
  const qn = thr.map((r) => r.Q / q0 * 100), dn = thr.map((r) => r.dPair / d0 * 100);
  const bi = qn.indexOf(Math.max(...qn));
  $('c2n').textContent = isDrive()
    ? (th[bi] === th[0] ? `Airflow-limited: shallower louvers win here because every bit of drag costs airflow. ${th[bi]}° gives ${fx(Math.max(...qn) - 100, 1)}% more heat than your ${fx(S.theta, 1)}°.` : `With airflow set by your duct and fan, heat peaks near ${th[bi]}° (${fx(Math.max(...qn) - 100, 1)}% vs your ${fx(S.theta, 1)}°). Steeper louvers add drag, which costs airflow.`)
    : `At fixed face velocity, steeper louvers keep adding heat transfer, but core ΔP climbs faster. Shown as % of your current design.`;
  chart($('c2'), { xs: th, series: [{ ys: dn, color: '#3fa7d6', name: 'air ΔP', w: 2, start: true }, { ys: qn, color: '#ef2b36', name: 'heat rejected', start: true }], mark: [S.theta, 100], best: isDrive() ? th[bi] : null, xl: 'louver angle, °', y0: Math.min(...qn, ...dn) * 0.9, yfmt: (v) => fx(v, 0) + '%' });
  // fin density sweep
  const fpi = []; for (let k = Math.min(Math.floor(25.4 / S.Fp), Math.max(8, Math.ceil(25.4 / (2.0 * S.Lp)))); k <= Math.max(30, Math.ceil(25.4 / S.Fp)); k += 1) fpi.push(k);
  const fr = fpi.map((k) => qAt({ Fp: 25.4 / k }));
  const qf = fr.map((r) => r.Q / q0 * 100), df = fr.map((r) => r.dPair / d0 * 100);
  const bf = qf.indexOf(Math.max(...qf));
  $('c3n').textContent = isDrive()
    ? `More fins add area but choke airflow. Best here is about ${fpi[bf]} fins per inch; you are at ${fx(25.4 / S.Fp, 1)}. Sweep stops where fin pitch passes 2× louver pitch.`
    : `At fixed face velocity more fins always help heat transfer; watch ΔP, which the fan or duct must supply.`;
  chart($('c3'), { xs: fpi, series: [{ ys: df, color: '#3fa7d6', name: 'air ΔP', w: 2, start: true }, { ys: qf, color: '#ef2b36', name: 'heat rejected', start: true }], mark: [25.4 / S.Fp, 100], best: isDrive() ? fpi[bf] : null, xl: 'fins per inch', y0: Math.min(...qf, ...df) * 0.9, yfmt: (v) => fx(v, 0) + '%' });
}

// ---------- ramps ----------
const mkRamp = (stops) => { const c = stops.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); const lut = new Uint8Array(256 * 3); for (let i = 0; i < 256; i++) { const t = i / 255 * (c.length - 1), k = Math.min(c.length - 2, Math.floor(t)), f = t - k; for (let j = 0; j < 3; j++) lut[i * 3 + j] = c[k][j] + (c[k + 1][j] - c[k][j]) * f; } return lut; };
const THERM = mkRamp(['#1c3a9e', '#2994db', '#8ce0d1', '#fae073', '#f58c33', '#db2133']);
const SPEED = mkRamp(['#05070c', '#0f2552', '#1d5fa8', '#2ea7d4', '#9be6ef', '#ffffff']);
const VORT = mkRamp(['#5fb3ff', '#2457c5', '#10151d', '#0b0e13', '#10151d', '#c83a2e', '#ff9d6b']);
const rgb = (lut, t) => { const i = Math.max(0, Math.min(255, t * 255 | 0)) * 3; return `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`; };

// ---------- face map ----------
const face = $('face'), fctx = face.getContext('2d');
let faceT = 0, probe = null, faceGeo = null, fcol = 't';
document.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => { fcol = b.dataset.fc; document.querySelectorAll('[data-fc]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
face.addEventListener('pointermove', (e) => { const b = face.getBoundingClientRect(); probe = [e.clientX - b.left, e.clientY - b.top]; });
face.addEventListener('pointerleave', () => { probe = null; });
face.addEventListener('pointerdown', (e) => { const b = face.getBoundingClientRect(); probe = [e.clientX - b.left, e.clientY - b.top]; });
function drawFace(dt) {
  if (!R) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = face.clientWidth, H = face.clientHeight;
  if (face.width !== Math.round(W * dpr)) { face.width = Math.round(W * dpr); face.height = Math.round(H * dpr); }
  const c = fctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const p = P, r = R, tank = Math.max(26, W * 0.07), x0 = tank + 6, x1 = W - tank - 6, top = 26, bot = H - 30;
  const coreW = x1 - x0, coreH = bot - top;
  const tubeH = Math.max(5, coreH * p.Th / (r.N * p.Th + r.rows * p.Fl) * 1.6);
  const finH = (coreH - r.N * tubeH) / r.rows;
  const tnT = (T) => (T - p.TaIn) / Math.max(0.1, p.TcIn - p.TaIn);
  // heat flux per unit face area for each cell (air temperature rise x capacity)
  const cellA = r.Afr / (r.nx * r.N), Cac = r.Ca / (r.nx * r.N);
  let qmax = 0, qmin = 1e9; for (const row of r.mapA) for (const v of row) { const q = Cac * (v - p.TaIn) / cellA / 1000; qmax = Math.max(qmax, q); qmin = Math.min(qmin, q); }
  if (qmax - qmin < 1e-6) qmax = qmin + 1;
  const qOf = (Ta) => Cac * (Ta - p.TaIn) / cellA / 1000;
  const tn = fcol === 't' ? tnT : (T) => (qOf(T) - qmin) / (qmax - qmin);
  const tnC = fcol === 't' ? tnT : () => -1;
  $('fLo').textContent = fcol === 't' ? F('temp', p.TaIn, 0) : fx(qmin, 0) + ' kW/m²';
  $('fHi').textContent = fcol === 't' ? F('temp', p.TcIn, 0) : fx(qmax, 0) + ' kW/m²';
  $('fMid').textContent = fcol === 't' ? 'temperature' : 'heat flux through the face';
  const cw = coreW / r.nx;
  let y = top;
  for (let k = 0; k < r.rows; k++) {
    const a = r.mapA[Math.min(r.N - 1, Math.max(0, k - 1))], b = r.mapA[Math.min(r.N - 1, k)];
    for (let i = 0; i < r.nx; i++) { c.fillStyle = rgb(THERM, tn((a[i] + b[i]) / 2)); c.fillRect(x0 + i * cw, y, cw + 0.6, finH + 0.5); }
    // fin hatching
    c.strokeStyle = 'rgba(11,14,19,.35)'; c.lineWidth = 1; c.beginPath();
    const step = Math.max(3, coreW / r.nf * 3);
    for (let x = x0; x < x1; x += step) { c.moveTo(x, y + 1); c.lineTo(x + step / 2, y + finH - 1); c.lineTo(x + step, y + 1); }
    c.stroke();
    y += finH;
    if (k < r.N) {
      const mc = r.mapC[k];
      for (let i = 0; i < r.nx; i++) { const v = tnC(mc[i]); c.fillStyle = v < 0 ? '#9aa6b4' : rgb(THERM, v); c.fillRect(x0 + i * cw, y, cw + 0.6, tubeH); }
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x0, y, coreW, 1);
      // coolant dashes
      c.fillStyle = 'rgba(255,255,255,.75)';
      const sp = 22, off = (faceT * 40 * Math.max(0.15, r.Vi / 0.3)) % sp;
      for (let x = x0 + off; x < x1; x += sp) c.fillRect(x, y + tubeH / 2 - 1, 7, 2);
      y += tubeH;
    }
  }
  faceGeo = { x0, x1, top, bot };
  if (probe && probe[0] > x0 && probe[0] < x1 && probe[1] > top && probe[1] < bot) {
    const fr = (probe[0] - x0) / coreW, ix = Math.min(r.nx - 1, Math.floor(fr * r.nx));
    const t = Math.min(r.N - 1, Math.max(0, Math.floor((probe[1] - top) / coreH * r.N)));
    const txt = [`Tube ${t + 1} of ${r.N}, ${fx(fr * 100, 0)}% along`, `Coolant ${F('temp', r.mapC[t][ix], 1)} · air leaving ${F('temp', r.mapA[t][ix], 1)}`, `Heat flux ${fx(qOf(r.mapA[t][ix]), 1)} kW/m² of face`];
    c.font = '500 13px Inter,sans-serif';
    const bw = Math.max(...txt.map((s) => c.measureText(s).width)) + 20, bh = 64;
    let bx = probe[0] + 14, by = probe[1] - bh - 8; if (bx + bw > W - 4) bx = probe[0] - bw - 14; if (by < 2) by = probe[1] + 14;
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(probe[0], probe[1], 6, 0, 7); c.stroke();
    c.fillStyle = 'rgba(11,14,19,.92)'; c.strokeStyle = '#33425a'; c.beginPath(); c.roundRect(bx, by, bw, bh, 8); c.fill(); c.stroke();
    c.fillStyle = '#e9eef4'; c.textAlign = 'left'; txt.forEach((s, i) => c.fillText(s, bx + 10, by + 20 + i * 18));
  }
  // tanks
  const tankG = (x) => { const g = c.createLinearGradient(x, 0, x + tank, 0); g.addColorStop(0, '#5d6876'); g.addColorStop(.5, '#c9d1da'); g.addColorStop(1, '#4a5462'); return g; };
  c.fillStyle = tankG(2); c.beginPath(); c.roundRect(2, top - 8, tank, coreH + 16, 6); c.fill();
  c.fillStyle = tankG(W - tank - 2); c.beginPath(); c.roundRect(W - tank - 2, top - 8, tank, coreH + 16, 6); c.fill();
  c.font = '600 13px Inter,sans-serif'; c.fillStyle = '#e9eef4'; c.textBaseline = 'alphabetic';
  c.textAlign = 'left'; c.fillText('In ' + F('temp', p.TcIn, 1), 2, 16);
  c.textAlign = 'right'; c.fillText('Out ' + F('temp', r.TcOut, 1), W - 2, H - 8);
  if (W > 560) { c.textAlign = 'center'; c.fillStyle = '#93a1b3'; c.fillText('coolant flows left to right · air flows into the page', W / 2, 16); }
}

// ---------- louver flow (worker) ----------
const flowCv = $('flow'), flx = flowCv.getContext('2d');
const field = document.createElement('canvas'), fdx = field.getContext('2d');
const trails = document.createElement('canvas'), trx = trails.getContext('2d');
let snap = null, geo = null, fmode = 'speed', showTr = true, paused = false, stepRate = 0, lastSnap = null, img = null;
const NTR = 1600; const tr = new Float32Array(NTR * 2);
const workerSrc = $('lbmsrc').textContent + `
let sim=null, running=true, timer=null;
function loop(){ if(!sim||!running){timer=setTimeout(loop,60);return;} const t0=performance.now(); while(performance.now()-t0<22) sim.step();
 const fe=sim.flowEfficiency(); const ux=sim.ux.slice(), uy=sim.uy.slice(), T=sim.T.slice();
 postMessage({type:'snap',ux,uy,T,steps:sim.steps,eta:fe.eta,angle:fe.angle,blown:sim.blown,t:performance.now()},[ux.buffer,uy.buffer,T.buffer]); sim.blown=false; timer=setTimeout(loop,4); }
onmessage=(e)=>{ const m=e.data;
 if(m.cmd==='build'){ sim=new LouverSim(); sim.build(m.cfg); postMessage({type:'geo',NX:sim.NX,NY:sim.NY,solid:sim.solid,segs:sim.segs,thick:sim.thick,u0:sim.u0,L:sim.L,Fpc:sim.Fpc,xs:sim.xs,finEnd:sim.finEnd,re:sim.re,tau:sim.tau0}); }
 else if(m.cmd==='re'&&sim){ sim.setRe(m.re); postMessage({type:'re',re:m.re,tau:sim.tau0}); }
 else if(m.cmd==='run'){ running=m.v; }
 else if(m.cmd==='reset'&&sim){ sim.reset(); } };
loop();`;
let worker = null;
try { worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }))); } catch (e) { worker = null; }
if (!worker) $('flowNote').textContent = 'This browser blocked the background solver, so the live louver simulation is unavailable here.';
let simKey = '', simRe = 0, buildTimer = null;
function updateSim() {
  if (!worker || !R) return;
  const key = [S.theta, (S.Fp / S.Lp).toFixed(3), (S.df / S.Lp).toFixed(3)].join('|');
  const re = Math.max(40, Math.min(800, R.ReLp));
  if (key !== simKey) {
    simKey = key; clearTimeout(buildTimer);
    buildTimer = setTimeout(() => { worker.postMessage({ cmd: 'build', cfg: { theta: S.theta, fpr: S.Fp / S.Lp, re, n: 6, lpc: 16, pitches: 4, tr: S.df / S.Lp, pad: 0.1 } }); simRe = re; }, geo ? 220 : 0);
  } else if (Math.abs(re - simRe) / simRe > 0.02) { simRe = re; worker.postMessage({ cmd: 're', re }); }
  $('sRe').textContent = fx(R.ReLp, 0) + (R.ReLp > 800 ? ' (sim 800)' : R.ReLp < 40 ? ' (sim 40)' : '');
}
if (worker) worker.onerror = (e) => { console.error('worker', e.message, e.lineno); };
if (worker) worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'geo') {
    geo = m; snap = null;
    field.width = m.NX; field.height = m.NY; img = fdx.createImageData(m.NX, m.NY);
    for (let i = 0; i < NTR; i++) respawn(i, true);
    trx.clearRect(0, 0, trails.width, trails.height);
  } else if (m.type === 'snap') {
    if (lastSnap) { const ds = m.steps - lastSnap.steps, dtt = (m.t - lastSnap.t) / 1000; if (ds > 0 && dtt > 0) stepRate = stepRate ? stepRate * 0.8 + 0.2 * ds / dtt : ds / dtt; }
    lastSnap = { steps: m.steps, t: m.t }; snap = m;
    $('sAng').textContent = fx(m.angle, 1) + '°';
    $('sEta').textContent = fx(m.eta * 100, 0) + '%';
    const reg = m.eta < 0.4 ? ['Duct-directed', '#3a2a12', '#f3cf9a'] : m.eta < 0.65 ? ['Transitional', '#132235', '#8fc8ff'] : ['Louver-directed', '#0f2a1f', '#8fe0bd'];
    const el = $('sReg'); el.textContent = reg[0]; el.style.background = reg[1]; el.style.color = reg[2];
    $('sSteps').textContent = fx(stepRate, 0) + ' steps/s';
  }
};
function respawn(i, any) { if (!geo) return; tr[i * 2] = any ? Math.random() * geo.NX : 1 + Math.random() * 3; tr[i * 2 + 1] = Math.random() * geo.NY; }
function sampleV(x, y) {
  const NX = geo.NX, NY = geo.NY, ux = snap.ux, uy = snap.uy;
  if (x < 0) x = 0; if (x > NX - 1.001) x = NX - 1.001; y = ((y % NY) + NY) % NY;
  const x0 = x | 0, y0 = y | 0, y1 = (y0 + 1) % NY, a = x - x0, b = y - y0;
  const i00 = y0 * NX + x0, i10 = i00 + 1, i01 = y1 * NX + x0, i11 = i01 + 1;
  return [(ux[i00] * (1 - a) + ux[i10] * a) * (1 - b) + (ux[i01] * (1 - a) + ux[i11] * a) * b, (uy[i00] * (1 - a) + uy[i10] * a) * (1 - b) + (uy[i01] * (1 - a) + uy[i11] * a) * b];
}
let panX = null;
(() => { let d = null; flowCv.addEventListener('pointerdown', (e) => { d = e.clientX; }); addEventListener('pointerup', () => { d = null; }); flowCv.addEventListener('pointermove', (e) => { if (d === null || panX === null) return; panX -= (e.clientX - d) / flowView.s; d = e.clientX; }); })();
const flowView = { s: 1, ox: 0 };
function drawFlow(dt) {
  const wrap = $('flowWrap'), dpr = Math.min(2, devicePixelRatio || 1);
  const W = wrap.clientWidth;
  if (!geo || !snap) { if (flowCv.width !== Math.round(W * dpr)) { flowCv.width = Math.round(W * dpr); flowCv.height = Math.round(240 * dpr); flowCv.style.height = '240px'; } flx.fillStyle = '#06080b'; flx.fillRect(0, 0, flowCv.width, flowCv.height); flx.fillStyle = '#93a1b3'; flx.font = `${14 * dpr}px Inter`; flx.fillText(worker ? 'Starting the solver…' : 'Solver unavailable', 20 * dpr, 40 * dpr); return; }
  const NX = geo.NX, NY = geo.NY;
  let s = W / NX, Hh = NY * s;
  const minH = W < 700 ? 220 : 240;
  if (Hh < minH) { s = minH / NY; Hh = minH; }
  const viewW = W / s;
  if (viewW >= NX) panX = null; else { if (panX === null) panX = geo.xs - geo.L * 1.5; panX = Math.max(0, Math.min(NX - viewW, panX)); }
  const ox = panX || 0; flowView.s = s; flowView.ox = ox;
  if (flowCv.width !== Math.round(W * dpr) || flowCv.height !== Math.round(Hh * dpr)) {
    flowCv.width = Math.round(W * dpr); flowCv.height = Math.round(Hh * dpr); flowCv.style.height = Hh + 'px';
    trails.width = flowCv.width; trails.height = flowCv.height;
  }
  // field image
  const d = img.data, ux = snap.ux, uy = snap.uy, T = snap.T, sol = geo.solid, uref = geo.u0 / (1 - geo.thick / geo.Fpc);
  for (let y = 0; y < NY; y++) {
    const yu = (y + 1) % NY, yd = (y - 1 + NY) % NY;
    for (let x = 0; x < NX; x++) {
      const i = y * NX + x, o = ((NY - 1 - y) * NX + x) * 4;
      let lut = SPEED, t;
      if (sol[i]) { d[o] = 26; d[o + 1] = 31; d[o + 2] = 39; d[o + 3] = 255; continue; }
      if (fmode === 'speed') t = Math.hypot(ux[i], uy[i]) / (uref * 1.9);
      else if (fmode === 'temp') { lut = THERM; t = T[i] * 0.92; }
      else { lut = VORT; const w = x > 0 && x < NX - 1 ? (uy[i + 1] - uy[i - 1]) - (ux[yu * NX + x] - ux[yd * NX + x]) : 0; t = 0.5 - w / (uref * 2.4); }
      const k = Math.max(0, Math.min(255, t * 255 | 0)) * 3;
      d[o] = lut[k]; d[o + 1] = lut[k + 1]; d[o + 2] = lut[k + 2]; d[o + 3] = 255;
    }
  }
  fdx.putImageData(img, 0, 0);
  const c = flx; c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(field, -ox * s * dpr, 0, NX * s * dpr, NY * s * dpr);
  // streaklines
  if (showTr) {
    trx.globalCompositeOperation = 'destination-out'; trx.fillStyle = 'rgba(0,0,0,.09)'; trx.fillRect(0, 0, trails.width, trails.height);
    trx.globalCompositeOperation = 'source-over';
    if (!paused) {
      const adv = Math.min(4, stepRate * dt);
      trx.strokeStyle = fmode === 'speed' ? 'rgba(255,214,140,.55)' : 'rgba(255,255,255,.55)'; trx.lineWidth = 1.1 * dpr; trx.beginPath();
      for (let i = 0; i < NTR; i++) {
        let x = tr[i * 2], y = tr[i * 2 + 1];
        const v = sampleV(x, y); const nx = x + v[0] * adv * 1.0, ny = y + v[1] * adv * 1.0;
        const xi = Math.min(NX - 1, Math.max(0, nx | 0)), yi = ((ny | 0) % NY + NY) % NY;
        if (nx > NX - 2 || sol[yi * NX + xi]) { respawn(i, false); continue; }
        const X0 = (x - ox) * s * dpr, Y0 = (NY - y) * s * dpr, X1 = (nx - ox) * s * dpr, Y1 = (NY - ny) * s * dpr;
        if (Math.abs(Y1 - Y0) < NY * s * dpr * 0.5) { trx.moveTo(X0, Y0); trx.lineTo(X1, Y1); }
        tr[i * 2] = nx; tr[i * 2 + 1] = ((ny % NY) + NY) % NY;
      }
      trx.stroke();
    }
    c.globalCompositeOperation = 'lighter'; c.drawImage(trails, 0, 0); c.globalCompositeOperation = 'source-over';
  }
  // louvers as crisp metal slats
  const th = Math.max(2.2, geo.thick * s) * dpr;
  for (const sg of geo.segs) {
    const X0 = (sg.x0 - ox) * s * dpr, Y0 = (NY - sg.y0) * s * dpr, X1 = (sg.x1 - ox) * s * dpr, Y1 = (NY - sg.y1) * s * dpr;
    if (Math.max(X0, X1) < -10 || Math.min(X0, X1) > flowCv.width + 10) continue;
    const g = c.createLinearGradient(X0, Y0 - th, X0, Y0 + th); g.addColorStop(0, '#f2f5f8'); g.addColorStop(0.5, '#9aa6b4'); g.addColorStop(1, '#4d5866');
    c.strokeStyle = g; c.lineWidth = th; c.lineCap = 'round'; c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1, Y1); c.stroke();
  }
  // labels
  c.font = `600 ${13 * dpr}px Inter,sans-serif`; c.fillStyle = 'rgba(233,238,244,.9)'; c.textAlign = 'left';
  const lab = (txt, x, y) => { const X = (x - ox) * s * dpr; if (X > 0 && X < flowCv.width - 90 * dpr) { c.lineWidth = 4 * dpr; c.strokeStyle = 'rgba(6,8,11,.8)'; c.strokeText(txt, X, y); c.fillText(txt, X, y); } };
  lab(ox > 0 ? '← drag to pan →' : 'air in →', ox + 3, 20 * dpr);
  lab('bank 1', geo.xs + geo.L * 1.4, 20 * dpr);
  lab('turnaround', geo.xs + geo.L * 7.1, 20 * dpr);
  lab('bank 2', geo.xs + geo.L * 9.2, 20 * dpr);
  lab('wake →', geo.finEnd + geo.L * 1.5, 20 * dpr);
}
const LEG = { speed: 'Speed: dark is still air, white is about twice the core velocity', temp: 'Temperature: blue is incoming air, red is air at fin-surface temperature', vort: 'Vorticity: red spins clockwise, blue counter-clockwise; shed vortices trail the fins' };
$('fLeg').textContent = LEG.speed;
document.querySelectorAll('[data-fm]').forEach((b) => b.addEventListener('click', () => { fmode = b.dataset.fm; $('fLeg').textContent = LEG[fmode]; document.querySelectorAll('[data-fm]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
$('fTr').onclick = () => { showTr = !showTr; $('fTr').setAttribute('aria-pressed', showTr); trx.clearRect(0, 0, trails.width, trails.height); };
$('fPause').onclick = () => { paused = !paused; $('fPause').setAttribute('aria-pressed', paused); worker && worker.postMessage({ cmd: 'run', v: !paused }); };
$('fReset').onclick = () => { worker && worker.postMessage({ cmd: 'reset' }); trx.clearRect(0, 0, trails.width, trails.height); };

// ---------- change pipeline ----------
let chartTimer = null, pending = false;
function changed(id, srcRow) {
  if (id === 'mode' || id === 'fan' || id === 'preset' || id === 'units') { renderCtl(); renderMini(); }
  else for (const el of rows[id] || []) el.sync();
  if (id === 'Fp') for (const el of rows.Fp) el.sync();
  if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; solve(); show(); updateSim(); syncAll(); }); }
  clearTimeout(chartTimer); chartTimer = setTimeout(charts, 140);
  save();
}
$('reset').onclick = () => { S = { ...DEF }; changed('preset'); };
$('copy').onclick = async () => {
  const p = P, r = R;
  const t = `Radiator Flow Lab\nCore ${F('len', p.W, 0, 2)} × ${F('len', p.H, 1, 2)} × ${F('len', p.D, 1, 2)}, ${fx(25.4 / p.Fp, 1)} FPI, louvers ${fx(p.theta, 1)}°\n`
    + (isDrive() ? `${F('spd', p.speed, 0)}, fan ${p.fan ? 'on' : 'off'}, duct Cp ${fx(p.Cp, 2)}\n` : '')
    + `Air ${F('temp', p.TaIn, 1)} at ${F('vel', p.Vface, 2)}; coolant ${F('temp', p.TcIn, 1)} at ${F('flowL', p.flow, 1, 2)}\n`
    + `Heat rejected ${fx(r.Q / 1000, 2)} kW · coolant out ${F('temp', r.TcOut, 1)} · air ΔP ${F('press', r.dPair, 0, 2)} · ε ${fx(r.eps, 2)}`;
  try { await navigator.clipboard.writeText(t); $('copy').textContent = 'Copied'; } catch (e) { $('copy').textContent = 'Copy blocked'; }
  setTimeout(() => { $('copy').textContent = 'Copy summary'; }, 1600);
};

// ---------- loop ----------
const vis = { view: true, flow: true, face: true };
const io = new IntersectionObserver((es) => { for (const e of es) vis[e.target.dataset.v] = e.isIntersecting; });
$('view').dataset.v = 'view'; $('flowWrap').dataset.v = 'flow'; face.dataset.v = 'face';
io.observe($('view')); io.observe($('flowWrap')); io.observe(face);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) { R3.autoSpin = false; $('vSpin').setAttribute('aria-pressed', 'false'); }
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (vis.view && R3.ok) R3.frame(reduce ? 0 : dt);
  if (vis.flow) drawFlow(dt);
  if (vis.face) { faceT += reduce ? 0 : dt; drawFace(dt); }
  requestAnimationFrame(tick);
}
buildTabs(); renderCtl(); renderMini();
solve(); show(); updateSim(); syncAll(); charts();
requestAnimationFrame(tick);
}
