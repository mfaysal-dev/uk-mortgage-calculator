import { monthlyPayment, interestOnlyPayment, overpaymentSavings, ltv, ltvBand, affordability } from './mortgage.js';

const $ = (s) => document.querySelector(s);
const gbp = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const gbp2 = (n) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (v) => Math.max(0, Math.min(100000000, Math.floor(Number(String(v).replace(/[^0-9.]/g, '')) || 0)));
const ym = (m) => { const y = Math.floor(m / 12), mo = m % 12; return [y && `${y} year${y > 1 ? 's' : ''}`, mo && `${mo} month${mo > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 months'; };
const SDLT_BASE = $('#sdltLink').getAttribute('href');

const state = { price: 300000, deposit: 30000, rate: 4.5, term: 25, type: 'repayment', over: 100, lump: 0, inc1: 60000, inc2: 0, mult: 4.5 };
const moneyFields = ['price', 'deposit', 'over', 'lump', 'inc1', 'inc2'];

function readParams() {
  const q = new URLSearchParams(location.search);
  for (const k of moneyFields) if (q.has(k)) state[k] = parseMoney(q.get(k));
  if (q.has('rate')) state.rate = clamp(parseFloat(q.get('rate')) || 0, 0, 20);
  if (q.has('term')) state.term = clamp(parseInt(q.get('term'), 10) || 25, 5, 40);
  if (['repayment', 'interest-only'].includes(q.get('type'))) state.type = q.get('type');
  if (['4', '4.5', '5', '5.5'].includes(q.get('mult'))) state.mult = +q.get('mult');
}
function writeParams() {
  const q = new URLSearchParams();
  for (const k of ['price', 'deposit', 'rate', 'term', 'type', 'over', 'lump', 'inc1', 'inc2', 'mult']) q.set(k, state[k]);
  history.replaceState(null, '', '?' + q.toString());
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function syncInputs() {
  for (const k of moneyFields) $('#' + k).value = state[k].toLocaleString('en-GB');
  $('#rate').value = state.rate;
  $('#term').value = state.term;
  document.querySelector(`input[name=type][value="${state.type}"]`).checked = true;
  const m = document.querySelector(`input[name=mult][value="${state.mult}"]`); if (m) m.checked = true;
}

// deposit % chips
const depChips = $('#depChips');
[5, 10, 15, 20, 25, 40].forEach((p) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.p = p; b.textContent = p + '% deposit';
  b.addEventListener('click', () => { state.deposit = Math.round((state.price * p) / 100); syncInputs(); update(); });
  depChips.appendChild(b);
});

function update() {
  const loan = Math.max(0, state.price - state.deposit);
  const lump = Math.min(state.lump, loan);
  const opts = { principal: loan, rate: state.rate, years: state.term, type: state.type, overpayment: state.over, lumpSum: lump };
  const o = overpaymentSavings(opts);
  const hasOver = state.over > 0 || lump > 0;
  const plan = hasOver ? o.withOver : o.base;
  const pay = state.type === 'interest-only' ? interestOnlyPayment(loan - lump, state.rate) : plan.payment;
  const l = ltv(loan, state.price);

  $('#termOut').textContent = `${state.term} years`;
  $('#term').setAttribute('aria-valuetext', `${state.term} years`);
  $('#pay').textContent = gbp2(pay);
  $('#summary').textContent = `${state.type === 'repayment' ? 'Repayment' : 'Interest-only'} mortgage of ${gbp(loan)} over ${state.term} years at ${state.rate}%` + (state.over > 0 ? `, plus ${gbp(state.over)}/month overpayment.` : '.');
  $('#loan').textContent = gbp(loan);
  $('#ltv').textContent = (l * 100).toFixed(1).replace(/\.0$/, '') + '%';
  $('#ltvBand').textContent = `Loan-to-value · ${loan > 0 ? ltvBand(l) + ' tier' : '—'}`;
  $('#interest').textContent = gbp(plan.totalInterest);
  $('#total').textContent = gbp(plan.totalPaid);
  $('#dep-hint').textContent = state.price > 0 ? `${((state.deposit / state.price) * 100).toFixed(1).replace(/\.0$/, '')}% of the price` : ' ';
  depChips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(state.price > 0 && Math.round((state.price * c.dataset.p) / 100) === state.deposit)));

  const notes = [];
  if (hasOver && o.interestSaved > 0.5) {
    notes.push(['', `💰 Overpaying saves <b>${gbp(o.interestSaved)}</b> in interest` + (o.monthsSaved > 0 ? ` and clears your mortgage <b>${ym(o.monthsSaved)}</b> sooner (in ${ym(o.withOver.months)}).` : '.')]);
    const firstYearOver = state.over * 12 + lump;
    if (firstYearOver > loan * 0.1 && loan > 0) notes.push(['warn', `⚠️ That’s ${gbp(firstYearOver)} in year one, more than 10% of the balance. Many fixed deals charge early repayment fees above this, so check your lender’s overpayment allowance.`]);
  }
  if (state.type === 'interest-only') {
    const n = state.term * 12;
    const owed = plan.months === n ? (plan.balances[n - 1] ?? loan) : 0;
    notes.push(['warn', `⚠️ Interest-only: you’ll still owe <b>${gbp(owed)}</b> at the end of the term${state.over > 0 ? ' after your overpayments' : ' unless you overpay'}. The repayment equivalent would be ${gbp2(monthlyPayment(loan, state.rate, state.term))}/month.`]);
  }
  if (state.deposit > state.price) notes.push(['warn', 'Your deposit is bigger than the price, so there’s nothing to borrow.']);
  else if (l > 0.95) notes.push(['warn', 'Most UK lenders need at least a 5% deposit (95% LTV maximum).']);
  $('#notes').innerHTML = notes.map(([c, t]) => `<div class="note ${c}">${t}</div>`).join('');

  $('#sdltLink').href = `${SDLT_BASE}?price=${state.price}&buyer=first-time`;

  drawChart(o, hasOver);
  drawDonut(loan, plan.totalInterest);
  drawStress(loan);
  drawSchedule(plan);
  updateAfford();
  writeParams();
}

function updateAfford() {
  const a = affordability({ income1: state.inc1, income2: state.inc2, multiple: state.mult, deposit: state.deposit });
  $('#maxLoan').textContent = gbp(a.maxLoan);
  $('#maxPrice').textContent = gbp(a.maxPrice);
  $('#maxPay').textContent = gbp2(state.type === 'interest-only' ? interestOnlyPayment(a.maxLoan, state.rate) : monthlyPayment(a.maxLoan, state.rate, state.term));
  const loan = Math.max(0, state.price - state.deposit);
  let note = '';
  if (a.income === 0) note = '<div class="note">Enter your income to see an estimate.</div>';
  else if (loan <= a.maxLoan) note = `<div class="note">✅ Your ${gbp(loan)} loan is <b>${(loan / a.income).toFixed(1)}×</b> your income, which is within a typical ${state.mult}× lending limit.</div>`;
  else note = `<div class="note warn">⚠️ Your ${gbp(loan)} loan is <b>${(loan / a.income).toFixed(1)}×</b> your income, above ${state.mult}×. You may need a bigger deposit (about ${gbp(loan - a.maxLoan)} more), a lower price or a lender offering higher multiples.</div>`;
  $('#affNote').innerHTML = note;
}

function drawChart(o, hasOver) {
  const W = 560, H = 290, P = { l: 58, r: 14, t: 14, b: 32 };
  const n = Math.max(1, state.term * 12);
  const start = Math.max(o.base.balances[0] || 0, 1);
  const top = niceCeil(start);
  const x = (m) => P.l + (m / n) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / top) * (H - P.t - P.b);
  const path = (bals) => bals.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b).toFixed(1)}`).join('');
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-size="11" font-family="inherit"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  for (let i = 0; i <= 4; i++) { const v = (top * i) / 4; s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="var(--muted)">${short(v)}</text>`; }
  const tickEvery = state.term > 25 ? 10 : 5;
  for (let yr = 0; yr <= state.term; yr += tickEvery) s += `<text x="${x(yr * 12)}" y="${H - 10}" text-anchor="middle" fill="var(--muted)">Yr ${yr}</text>`;
  const main = hasOver ? o.withOver.balances : o.base.balances;
  if (main.length > 1) s += `<path d="${path(main)}L${x(main.length - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="url(#ag)"/>`;
  if (hasOver) s += `<path d="${path(o.base.balances)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += `<path d="${path(main)}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>`;
  if (hasOver && o.monthsSaved > 0) { const mx = x(o.withOver.months); s += `<circle cx="${mx}" cy="${y(0)}" r="5" fill="var(--accent)"/><text x="${Math.min(mx, W - 90)}" y="${y(0) - 10}" fill="var(--accent)" font-weight="700">Mortgage-free</text>`; }
  $('#chart').innerHTML = s + '</svg>';
}

function drawDonut(loan, interest) {
  const total = loan + interest || 1, R = 70, C = 2 * Math.PI * R, f = loan / total;
  $('#donut').innerHTML = `<svg viewBox="0 0 170 170" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-90 85 85)"><circle cx="85" cy="85" r="${R}" fill="none" stroke="#f59e0b" stroke-width="22"/><circle cx="85" cy="85" r="${R}" fill="none" stroke="var(--accent)" stroke-width="22" stroke-dasharray="${(C * f).toFixed(2)} ${C}"/></g><text x="85" y="82" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink)">${Math.round((interest / total) * 100)}%</text><text x="85" y="102" text-anchor="middle" font-size="11" fill="var(--muted)">is interest</text></svg>`;
  $('#splitLegend').innerHTML = `<span><i style="background:var(--accent)"></i>Loan repaid <b style="color:var(--ink)">${gbp(loan)}</b></span><span><i style="background:#f59e0b"></i>Interest <b style="color:var(--ink)">${gbp(interest)}</b></span>`;
}

function drawStress(loan) {
  const rows = [-1, 0, 1, 2, 3].map((d) => { const r = Math.max(0, state.rate + d); return { d, r, p: state.type === 'interest-only' ? interestOnlyPayment(loan, r) : monthlyPayment(loan, r, state.term) }; });
  const max = Math.max(...rows.map((x) => x.p), 1);
  $('#stress').innerHTML = rows.map((x) => `<div class="barrow ${x.d === 0 ? 'current' : ''}"><span class="label">${x.d === 0 ? 'Your rate' : (x.d > 0 ? '+' : '') + x.d + '%'} (${+x.r.toFixed(2)}%)</span><span class="track"><span class="fill" style="width:${(x.p / max) * 100}%;background:${x.d > 0 ? '#f97316' : x.d < 0 ? '#10b981' : 'var(--accent)'}"></span></span><b>${gbp(x.p)}</b></div>`).join('');
}

function drawSchedule(plan) {
  $('#sched').innerHTML = plan.years.map((y) => `<tr><td>${y.year}</td><td class="r">${gbp(y.interest)}</td><td class="r">${gbp(y.capital)}</td><td class="r">${gbp(y.balance)}</td></tr>`).join('');
}

function niceCeil(v) { const e = 10 ** Math.floor(Math.log10(v)); const f = v / e; const s = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x + 1e-9); return s * e; }
function short(v) { return v >= 1e6 ? '£' + +(v / 1e6).toFixed(2) + 'm' : v >= 1000 ? '£' + +(v / 1000).toFixed(1) + 'k' : '£' + Math.round(v); }

// events
for (const k of moneyFields) {
  const el = $('#' + k);
  el.addEventListener('input', () => { state[k] = parseMoney(el.value); update(); });
  el.addEventListener('blur', () => { el.value = state[k].toLocaleString('en-GB'); });
  el.addEventListener('focus', () => el.select());
}
$('#rate').addEventListener('input', (e) => { state.rate = clamp(parseFloat(e.target.value) || 0, 0, 20); update(); });
$('#term').addEventListener('input', (e) => { state.term = +e.target.value; update(); });
document.querySelectorAll('input[name=type]').forEach((el) => el.addEventListener('change', () => { state.type = el.value; update(); }));
document.querySelectorAll('input[name=mult]').forEach((el) => el.addEventListener('change', () => { state.mult = +el.value; update(); }));

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg); }
}
$('#share').addEventListener('click', () => copy(location.href, 'Link copied'));
$('#copy').addEventListener('click', () => copy(`UK mortgage: ${$('#summary').textContent} Monthly payment ${$('#pay').textContent}, total interest ${$('#interest').textContent}. ${location.href}`, 'Result copied'));

readParams();
syncInputs();
update();
