// Ringleader dashboard
// Gets its data from the server (/api/dashboard) and draws one page at a time.
// If there's no server (you opened the file by itself), it shows the example data from data.js.
// The page shown depends on the end of the address: #overview, #conversations, #autotext, #frontdesk.

let data = window.RL_DATA;
let mode = 'example'; // 'example' = no server, 'test' = server without Twilio keys, 'live' = real texts
const main = document.getElementById('main');

// ---------- Small helpers ----------

const money = n => '$' + Math.round(n).toLocaleString('en-US');

// Makes text safe to put inside HTML (so a customer's message can't break the page).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Puts the business name into a message template.
const fill = template => String(template).replace(/\{business\}/g, data.business.name);

// The server adds this to every auto-text that doesn't already mention STOP.
const withOptOut = text => /\bSTOP\b/i.test(text) ? text : text.trim() + ' Reply STOP to opt out.';

// The whole auto-text, like the server builds it: the message, the shop's contact line (CASL), then how to stop.
const autoTextOf = (template, contact) => withOptOut([fill(template).trim(), fill(contact || '').trim()].filter(Boolean).join(' '));

// Conversations the owner needs to act on: ready to book, or the customer wrote and is waiting.
const needsYou = c => c.status === 'ready' || c.status === 'waiting';

const STATUS = {
  ready: 'Ready to book',
  gathering: 'AI asking',
  waiting: 'Waiting on you',
  replied: 'You replied',
  booked: 'Booked',
  'no-reply': 'No reply yet',
  'opted-out': 'Texted STOP'
};

// "Today", "Yesterday", or the weekday name.
function dayName(daysAgo) {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

const who = c => c.name || c.phone;
const lastText = c => c.messages.length ? c.messages[c.messages.length - 1].text : '';
const lastCustomerText = c => [...c.messages].reverse().find(m => m.from === 'customer')?.text || lastText(c);
const customerReplied = c => c.messages.some(m => m.from === 'customer');
// How many days Today looks back over: 7, 30 or 60 (the buttons at the top of Today).
let range = 7;
const busyDemo = /[?&]busy\b/.test(location.search);
const inRange = () => data.conversations.filter(c => c.daysAgo < range);

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return data.business.owner ? `${part}, ${data.business.owner}.` : `${part}.`;
}

// A short message at the bottom of the screen ("Saved", or what went wrong).
let toastTimer;
function toast(text, isError) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.toggle('error', Boolean(isError));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

const arrow = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

// ---------- Talking to the server ----------

async function load() {
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('No server');
    data = await res.json();
    mode = data.mode;
  } catch {
    mode = 'example';
    // ?busy on the end of the address shows the two-busy-months example instead of the quiet week
    if (busyDemo) data = window.RL_BUSY;
    // In the example data the auto-text is left blank, so fill it in from the template.
    data.conversations.forEach(c => {
      const first = c.messages[0];
      if (first && first.from === 'auto' && !first.text) first.text = autoTextOf(data.autoText.message, data.autoText.contactLine);
    });
  }
}

async function api(path, body, method = 'POST') {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Is the server running?');
  return json;
}

// ---------- Numbers (all worked out from the conversations, so they always add up) ----------

function stats() {
  const week = inRange();
  const booked = week.filter(c => c.status === 'booked');
  return {
    missed: week.length,
    texted: week.filter(c => c.messages.some(m => m.from === 'auto')).length,
    replied: week.filter(customerReplied).length,
    booked: booked.length,
    money: booked.reduce((sum, c) => sum + c.value, 0),
    waiting: data.conversations.filter(needsYou).length
  };
}

const pct = (part, whole) => whole ? Math.round((part / whole) * 100) : 0;

// Every day in the range, oldest first, each with its conversations.
// 7 days are labelled Mon, Tue...; longer ranges get dates like Oct 3.
function rangeDays() {
  return Array.from({ length: range }, (_, i) => range - 1 - i).map(ago => {
    const date = new Date(Date.now() - ago * 864e5);
    return {
      ago,
      label: ago === 0 ? 'Today' : date.toLocaleDateString('en-US', range === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }),
      list: data.conversations.filter(c => c.daysAgo === ago)
    };
  });
}

// A smooth line through points (so the chart curves instead of zig-zagging).
function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[i + 2] || pts[i + 1];
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6], c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    // Keep the curve from dipping below a flat stretch.
    c1[1] = Math.min(Math.max(c1[1], Math.min(y1, y2)), Math.max(y1, y2));
    c2[1] = Math.min(Math.max(c2[1], Math.min(y1, y2)), Math.max(y1, y2));
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`;
  }
  return d;
}

// ---------- Page: Today ----------

function overviewPage() {
  const s = stats();
  const needs = data.conversations.filter(needsYou).sort((a, b) => (b.status === 'ready') - (a.status === 'ready'));
  const recent = data.conversations.filter(c => !needsYou(c)).slice(0, 7);
  const statusLine = mode === 'live'
    ? `Text-Back is on. Calls you miss on ${esc(data.business.ownerPhone)} get a text in about 5 seconds.`
    : mode === 'test'
      ? 'Test mode. Nothing is really sent. Open the simulator to try it.'
      : busyDemo
        ? `Example: two busy months. <a class="link" href="${location.pathname}#overview">Back to the quiet week</a>`
        : `Example data. Start the server to see your real calls. <a class="link" href="?busy#overview">See it after two busy months &rarr;</a>`;

  return `
    <section class="hero" aria-label="This week">
      <div class="hero-copy">
        <div class="range-row">
          <p class="kicker"><span class="pulse"></span>Last ${range} days</p>
          <div class="range" role="group" aria-label="How far back to look">${[7, 30, 60].map(n => `<button type="button" data-range="${n}" aria-pressed="${n === range}">${n}d</button>`).join('')}</div>
        </div>
        <h1>${esc(greeting())}</h1>
        <p class="hero-money" data-count="${s.money}">${money(s.money)}</p>
        <p class="hero-sub">${s.money ? `in jobs booked from <span class="hi">calls you missed</span>.` : 'in booked jobs so far. They stack up here as calls turn into work.'}</p>
        <p class="status-line">${statusLine}</p>
      </div>
      <div class="hero-viz">
        <div class="radar-slot" aria-hidden="true"></div>
        <p class="radar-legend"><span><i class="lg-booked"></i>Booked (taller = bigger job)</span><span><i class="lg-replied"></i>Texted back</span><span><i class="lg-none"></i>No reply</span></p>
      </div>
    </section>

    ${tickerHtml()}

    ${mode === 'test' ? testPanel() : ''}

    <section aria-label="Needs you">
      <div class="needs-head">
        ${needs.length ? `<span class="big-count">${needs.length}</span><h2>${needs.length === 1 ? 'job needs' : 'jobs need'} you</h2>` : ''}
      </div>
      ${needs.length
        ? `<div class="needs-grid">${needs.map(jobCard).join('')}</div>`
        : `<div class="all-clear"><b>All clear.</b><p class="empty">Nobody is waiting on you. New texts show up here.</p></div>`}
    </section>

    <section class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Missed call <span class="hi">&rarr;</span> booked job</h2></div>
        ${funnelHtml(s)}
      </div>
      <div class="card">
        <div class="card-head"><h2>How it's going</h2></div>
        ${ringsHtml(s)}
      </div>
    </section>

    <section class="card money-card">
      <div class="card-head"><h2>Booked, adding up</h2><span class="note">${money(s.money)} in ${range} days</span></div>
      <div class="hero-chart">${heroChart()}</div>
    </section>

    <section class="card week">
      <div class="card-head">
        <h2>Missed calls by ${range > 30 ? 'week' : 'day'}</h2>
        <div class="legend">
          <span><i style="background: var(--hivis)"></i>Booked</span>
          <span><i style="background: var(--mid)"></i>Texted back</span>
          <span><i style="background: var(--dim)"></i>No reply</span>
        </div>
      </div>
      ${weekChart()}
    </section>

    <section class="card">
      <div class="card-head"><h2>Recent</h2>${recent.length ? `<a class="link" href="#conversations">All texts &rarr;</a>` : ''}</div>
      ${recent.length ? `<div class="feed">${recent.map(feedRow).join('')}</div>`
        : `<p class="empty">No missed calls yet. When a call is missed, it shows up here.</p>`}
    </section>
  `;
}

// The green ticker of what just happened, newest first.
function tickerHtml() {
  const events = data.conversations.slice(0, 10).map(c => ({
    booked: `${who(c)} booked ${money(c.value)}`,
    ready: `${who(c)} is ready to book`,
    waiting: `${who(c)} texted back`,
    gathering: `The AI is asking ${who(c)} for details`,
    replied: `You replied to ${who(c)}`,
    'no-reply': `Missed call from ${c.phone}, texted back`,
    'opted-out': `${who(c)} opted out`
  }[c.status] || who(c)));
  const items = events.length ? events : ['Waiting for the first missed call', 'Every missed call gets a text in seconds'];
  const row = items.map(t => `<span>${esc(t)}</span>`).join('');
  return `<div class="ticker" aria-hidden="true"><div class="ticker-track">${row}${row}</div></div>`;
}

// A big card for someone the owner should answer.
function jobCard(c) {
  const ready = c.status === 'ready';
  return `
    <a class="job ${ready ? 'ready' : ''}" href="#conversations" data-open="${c.id}">
      <span class="job-top"><span class="pill ${c.status}">${STATUS[c.status]}</span><time>${dayName(c.daysAgo)} ${esc(c.time)}</time></span>
      <span class="quote">${esc(ready && c.summary ? c.summary : '“' + lastCustomerText(c) + '”')}</span>
      <span class="who">${esc(who(c))}<span class="go">${arrow}</span></span>
    </a>`;
}

function feedRow(c) {
  return `
    <a href="#conversations" data-open="${c.id}">
      <span class="dot ${c.status}"></span>
      <span><b>${esc(who(c))}</b><p>${esc(lastText(c))}</p></span>
      <span class="side"><span class="pill ${c.status}">${STATUS[c.status]}${c.status === 'booked' ? ' ' + money(c.value) : ''}</span><time>${dayName(c.daysAgo)} ${esc(c.time)}</time></span>
    </a>`;
}

// "Booked, adding up": the running total of booked jobs over the range, with each day's bookings as faint bars behind it.
function heroChart() {
  const days = rangeDays(), n = days.length;
  const daily = days.map(d => d.list.filter(c => c.status === 'booked'));
  const dailySum = daily.map(list => list.reduce((sum, c) => sum + c.value, 0));
  let total = 0;
  const running = dailySum.map(v => (total += v));
  const W = 960, H = 300, L = 62, R = 26, T = 40, B = 36;
  const max = niceMax(Math.max(...running, 100));
  const maxDay = Math.max(...dailySum, 1);
  const step = (W - L - R) / (n - 1);
  const x = i => L + i * step;
  const y = v => T + (H - T - B) * (1 - v / max);
  const pts = running.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const best = dailySum.indexOf(Math.max(...dailySum));
  const every = Math.ceil(n / 8);
  let svg = '';
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"${k ? ' stroke-dasharray="3 6"' : ''}/><text x="${L - 12}" y="${y(v) + 4}" text-anchor="end" class="axis">${shortMoney(v)}</text>`;
  }
  // each day's bookings as a faint bar, scaled to the busiest day
  const bw = Math.max(3, Math.min(28, step * 0.55));
  days.forEach((d, i) => {
    if (!dailySum[i]) return;
    const h = (H - T - B) * 0.42 * dailySum[i] / maxDay;
    svg += `<rect class="day-bar fade-in" x="${x(i) - bw / 2}" y="${y(0) - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2)}"/>`;
  });
  svg += `<path class="fade-in" d="${area}" fill="url(#heroFill)"/>`;
  svg += `<path d="${line}" fill="none" stroke="#C8FF2E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".22" filter="url(#heroGlow)"/>`;
  svg += `<path class="draw" d="${line}" fill="none" stroke="url(#heroLine)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (n <= 30) pts.forEach(([px, py], i) => { if (dailySum[i]) svg += `<circle class="fade-in" cx="${px}" cy="${py}" r="${n > 7 ? 3.5 : 5}" fill="var(--bg)" stroke="#C8FF2E" stroke-width="2"/>`; });
  // a flag on the best day
  if (dailySum[best]) {
    const [bx, by] = pts[best];
    const anchor = best > n * 0.8 ? 'end' : best < n * 0.2 ? 'start' : 'middle';
    svg += `<g class="fade-in"><line x1="${bx}" x2="${bx}" y1="${by - 9}" y2="${T - 16}" stroke="var(--mid)" stroke-dasharray="2 4"/><text x="${bx}" y="${T - 22}" text-anchor="${anchor}" class="flag-text">Best day: ${money(dailySum[best])}</text></g>`;
  }
  // the total so far, pulsing at the end of the line
  const [lx, ly] = pts[n - 1];
  svg += `<circle cx="${lx}" cy="${ly}" r="16" fill="#C8FF2E" opacity=".16"><animate attributeName="r" values="10;22;10" dur="2.4s" repeatCount="indefinite"/></circle><circle class="fade-in" cx="${lx}" cy="${ly}" r="7" fill="#C8FF2E"/>`;
  days.forEach((d, i) => { if ((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="axis${d.ago === 0 ? ' today' : ''}">${esc(d.label)}</text>`; });
  days.forEach((d, i) => {
    const jobs = daily[i].length;
    svg += `<rect x="${x(i) - step / 2}" y="0" width="${step}" height="${H}" fill="transparent" data-tip="${esc(d.label)}: ${money(dailySum[i])} booked (${jobs} job${jobs === 1 ? '' : 's'}), ${money(running[i])} so far"/>`;
  });
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Booked dollars adding up over the last ${n} days, ${money(total)} in total">
      <defs>
        <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8FF2E" stop-opacity=".38"/><stop offset="1" stop-color="#C8FF2E" stop-opacity="0"/></linearGradient>
        <linearGradient id="heroLine" x1="0" x2="1"><stop offset="0" stop-color="#86AE1E"/><stop offset="1" stop-color="#EAFF9E"/></linearGradient>
        <filter id="heroGlow" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      ${svg}
    </svg>`;
}
const shortMoney = v => v >= 1000 ? '$' + +(v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);
// Rounds the top of a chart up to a tidy number (1, 2, 2.5 or 5 times a power of ten).
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

// Funnel: missed calls, texted back, wrote back, booked.
function funnelHtml(s) {
  const rows = [
    ['Missed calls', s.missed, 'var(--dim)'],
    ['Got a text back', s.texted, '#5C5C63'],
    ['Texted you back', s.replied, 'var(--mid)'],
    ['Booked a job', s.booked, 'var(--hivis)']
  ];
  const steps = [`${pct(s.texted, s.missed)}% got a text in seconds`, `${pct(s.replied, s.texted)}% wrote back`, `${pct(s.booked, s.replied)}% turned into jobs`];
  return `<div class="funnel">${rows.map(([label, n, color], i) => `
    <div class="f-row ${i === 3 ? 'win' : ''}" data-tip="${esc(label)}: ${n}">
      <div class="f-text"><span>${label}</span><b class="f-num">${n}</b></div>
      <div class="f-bar"><i class="f-fill" style="--w: ${s.missed ? Math.max(n ? 3 : 0, (n / s.missed) * 100) : 0}%; --c: ${color}; --i: ${i}"></i></div>
    </div>${i < 3 ? `<p class="f-step">${steps[i]}</p>` : ''}`).join('')}
  </div>`;
}

// Two rings (reply rate, booking rate) and two numbers.
function ringsHtml(s) {
  const ring = (value, label, sub) => {
    const r = 52, C = 2 * Math.PI * r;
    return `
      <div class="ring" data-tip="${esc(label)}: ${value}%">
        <div class="ring-wrap">
          <svg viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--panel-2)" stroke-width="14"/>
            <circle class="arc" cx="66" cy="66" r="${r}" fill="none" stroke="#C8FF2E" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - value / 100)}" style="--full: ${C}"/>
          </svg>
          <span class="ring-num">${value}%</span>
        </div>
        <b>${label}</b><span>${sub}</span>
      </div>`;
  };
  return `
    <div class="rings">
      ${ring(pct(s.replied, s.texted), 'Reply rate', 'of texted callers wrote back')}
      ${ring(pct(s.booked, s.replied), 'Booking rate', 'of replies became jobs')}
    </div>
    <div class="tile-row">
      <div class="tile"><b>${s.booked ? money(s.money / s.booked) : '$0'}</b><span>average job</span></div>
      <div class="tile"><b>${s.replied}</b><span>callers saved from going to someone else</span></div>
    </div>`;
}

// "Missed calls": 3D stacked blocks. Green = booked, grey = texted back, dark = no reply.
// 7 or 30 days get a block per day; 60 days get a block per week.
function weekChart() {
  let buckets = rangeDays();
  if (range > 30) {
    const weeks = [];
    for (let i = buckets.length; i > 0; i -= 7) {
      const chunk = buckets.slice(Math.max(0, i - 7), i);
      weeks.unshift({ ago: chunk[chunk.length - 1].ago, label: chunk[0].label, list: chunk.flatMap(d => d.list), span: `${chunk[0].label} to ${chunk[chunk.length - 1].label}` });
    }
    buckets = weeks;
  }
  const rows = buckets.map(d => {
    const booked = d.list.filter(c => c.status === 'booked').length;
    const replied = Math.max(0, d.list.filter(customerReplied).length - booked);
    return { ...d, booked, replied, none: Math.max(0, d.list.length - booked - replied) };
  });
  const n = rows.length, W = 960, H = 320, L = 40, R = 34, T = 48, B = 40;
  const max = Math.max(4, ...rows.map(d => d.list.length));
  const step = (W - L - R) / n, bw = step * 0.58;
  const dx = Math.min(22, step * 0.3), dy = dx * 0.6;
  const y = v => T + (H - T - B) * (1 - v / max);
  const y0 = y(0), unit = y0 - y(1);
  let svg = `<polygon points="${L},${y0} ${W - R},${y0} ${W - R + dx},${y0 - dy} ${L + dx},${y0 - dy}" fill="rgba(255,255,255,.03)" stroke="var(--line)"/>`;
  const tickStep = max > 8 ? Math.ceil(max / 4) : 2;
  for (let v = tickStep; v <= max; v += tickStep) {
    svg += `<line x1="${L + dx}" x2="${W - R + dx}" y1="${y(v) - dy}" y2="${y(v) - dy}" stroke="var(--line)" stroke-dasharray="3 6"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`;
  }
  // [front, top, side] for each kind of block
  const COL = { booked: ['#C8FF2E', '#E6FF94', '#8FB41E'], replied: ['#8C8C86', '#B3B3AD', '#62625D'], none: ['#3A3A40', '#55555D', '#28282D'] };
  const every = Math.ceil(n / 10);
  rows.forEach((d, i) => {
    const x = L + i * step + (step - bw - dx) / 2;
    let base = y0, col = '';
    [['booked', d.booked], ['replied', d.replied], ['none', d.none]].forEach(([kind, count]) => {
      if (!count) return;
      const top = base - count * unit;
      const [front, lid, side] = COL[kind];
      col += `<rect x="${x}" y="${top}" width="${bw}" height="${base - top}" fill="${front}"/>`
        + `<polygon points="${x + bw},${top} ${x + bw + dx},${top - dy} ${x + bw + dx},${base - dy} ${x + bw},${base}" fill="${side}"/>`
        + `<polygon points="${x},${top} ${x + dx},${top - dy} ${x + bw + dx},${top - dy} ${x + bw},${top}" fill="${lid}"/>`;
      base = top;
    });
    const today = d.ago === 0;
    if (today && d.list.length) svg += `<ellipse cx="${x + (bw + dx) / 2}" cy="${y0 - dy / 2}" rx="${bw * 0.9 + 6}" ry="${dy + 6}" fill="#C8FF2E" opacity=".22" filter="url(#colGlow)"/>`;
    svg += `<g class="col" style="--i: ${(i * 7 / n).toFixed(2)}">${col}</g>`;
    if (d.list.length && (n <= 14 || d.list.length === max)) svg += `<text x="${x + (bw + dx) / 2}" y="${base - dy - 10}" text-anchor="middle" class="col-num">${d.list.length}</text>`;
    if ((i % every === 0 && n - 1 - i >= every / 2) || today) svg += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" class="axis${today ? ' today' : ''}">${esc(d.label)}</text>`;
    const tip = `${d.span || d.label}: ${d.list.length} missed, ${d.booked + d.replied} texted back, ${d.booked} booked`;
    svg += `<rect x="${L + i * step}" y="0" width="${step}" height="${H}" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Missed calls over the last ${range} days"><defs><filter id="colGlow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="8"/></filter></defs>${svg}</svg>`;
}

// Only in test mode: pretend to be a caller.
// The number and text are kept here so they stay the same after the page refreshes.
const testInputs = {
  phone: '(555) 014-' + String(Math.floor(1000 + Math.random() * 9000)),
  text: 'Hi, my water heater is leaking. Can someone come today?',
  owner: 'I can be there at 2 today. Does that work?',
  summary: '',
  open: true
};
function testPanel() {
  return `
    <details class="sim" ${testInputs.open ? 'open' : ''}>
      <summary>Simulator <span class="tape" aria-hidden="true"></span><svg class="chev" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="sim-body">
        <form class="test-row" data-test="call">
          <label for="test-phone">Caller's number</label>
          <input id="test-phone" value="${esc(testInputs.phone)}" autocomplete="off">
          <button class="btn btn-main" type="submit">Simulate missed call</button>
        </form>
        <form class="test-row" data-test="text">
          <label for="test-text">They text back</label>
          <input id="test-text" value="${esc(testInputs.text)}" autocomplete="off">
          <button class="btn" type="submit">Simulate customer reply</button>
        </form>
        <form class="test-row" data-test="owner">
          <label for="test-owner">You text from your phone</label>
          <input id="test-owner" value="${esc(testInputs.owner)}" autocomplete="off">
          <button class="btn" type="submit">Simulate your text</button>
        </form>
        <form class="test-row" data-test="followup">
          <span class="label-like">Next-day follow-up</span>
          <p class="summary-preview">Pretend a day passed: everyone who never wrote back gets it.</p>
          <button class="btn" type="submit">Send follow-ups now</button>
        </form>
        <form class="test-row" data-test="summary">
          <span class="label-like">Morning summary</span>
          <p class="summary-preview">${testInputs.summary ? esc(testInputs.summary) : 'What the owner would get if it went out right now.'}</p>
          <button class="btn" type="submit">Preview summary</button>
        </form>
        <p class="note">Replies come from the caller's number above. Try calling twice (only one text goes out), or texting STOP. Your text goes to whoever texted last, or start it with # and a number, like #3.</p>
      </div>
    </details>`;
}

// ---------- Page: Texts ----------

let filter = 'all';
let search = ''; // what's typed in the search box above the list
let openId = null;
let editingName = false;
// On phones the list and the open conversation are two screens, like a texting app.
let chatOpen = false;
let chatInHistory = false; // true when the phone's Back button should close the chat
const isPhone = () => matchMedia('(max-width: 860px)').matches;

const FILTERS = [
  ['all', 'All', () => true],
  ['needs', 'Needs you', needsYou],
  ['ai', 'AI asking', c => c.status === 'gathering'],
  ['booked', 'Booked', c => c.status === 'booked']
];
const checklist = () => data.checklist || [];
const detailsIn = c => c.details ? checklist().filter(i => c.details.items[i.key]).length : 0;
const firstName = c => c.name ? c.name.split(' ')[0] : 'them';
const telLink = c => 'tel:+1' + String(c.phone).replace(/\D/g, '').slice(-10);
const initials = c => c.name ? c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '#';
const groupOf = days => days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days <= 6 ? 'This week' : days <= 13 ? 'Last week' : 'Earlier';
// Search looks through names, numbers, the AI's job summary and every text.
const matches = c => !search || [c.name, c.phone, c.summary, ...c.messages.map(m => m.text)].some(t => t && String(t).toLowerCase().includes(search.toLowerCase()));
const shownList = () => data.conversations.filter((FILTERS.find(f => f[0] === filter) || FILTERS[0])[2]).filter(matches);
// The list, with a heading each time the day group changes.
function listHtml(list) {
  let html = '', last = '';
  for (const x of list) {
    const group = groupOf(x.daysAgo);
    if (group !== last) { html += `<p class="group">${group}</p>`; last = group; }
    html += listItem(x);
  }
  return html || `<p class="empty" style="padding: 14px">${search ? 'No texts match that.' : 'Nothing here right now.'}</p>`;
}
// One-tap starts for a reply. They fill the box; nothing sends until you press Send.
const quickReplies = c => [
  `${c.name ? `Hi ${firstName(c)}, ` : 'Hi, '}it's ${data.business.owner}. I can come by today at `,
  "What's the address?",
  'Can you send a photo of it?',
  "You're booked. See you then."
];

function conversationsPage() {
  const list = shownList();
  if (!list.some(c => c.id === openId)) { openId = list[0] ? list[0].id : null; editingName = false; }
  const c = data.conversations.find(x => x.id === openId);

  return `
    <header class="page-top${chatOpen ? ' chat-open' : ''}">
      <h1 class="page-title">Texts<span class="hi">.</span></h1>
      <div class="tabs" role="group" aria-label="Filter conversations">
        ${FILTERS.map(([key, label, fn]) => `<button type="button" data-filter="${key}" aria-pressed="${filter === key}">${label}<span class="n">${data.conversations.filter(fn).length}</span></button>`).join('')}
      </div>
    </header>

    <section class="inbox${chatOpen ? ' chat-open' : ''}">
      <div class="inbox-side">
        <label class="search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><span hidden>Search</span><input id="search" type="search" placeholder="Search names, numbers, texts" value="${esc(search)}" autocomplete="off"></label>
        <div class="inbox-list">${listHtml(list)}</div>
      </div>
      ${c ? threadHtml(c) + jobPanel(c) : `<div class="thread"><p class="empty" style="padding: 24px">Pick a conversation.</p></div>`}
    </section>
  `;
}

function listItem(x) {
  // Once the AI has the details, the one-line job summary says more than the last text.
  const line = x.summary && x.status !== 'no-reply' ? x.summary : lastText(x);
  const progress = x.status === 'gathering' ? ` ${detailsIn(x)}/${checklist().length}` : '';
  return `
    <button type="button" data-open="${x.id}" class="${x.id === openId ? 'active' : ''} ${x.status}">
      <span class="av ${x.status}" aria-hidden="true">${esc(initials(x))}</span>
      <span class="top"><b>${esc(who(x))}</b><time>${dayName(x.daysAgo)}</time></span>
      <span class="preview">${esc(line)}</span>
      <span><span class="pill ${x.status}">${STATUS[x.status]}${progress}${x.status === 'booked' ? ' ' + money(x.value) : ''}</span>${x.details?.timingAsked && x.status !== 'booked' ? '<span class="pill timing">Asked timing</span>' : ''}</span>
    </button>`;
}

function messageLabel(m, c) {
  const base = { auto: 'Auto-text', followup: 'Follow-up', assistant: 'AI assistant', owner: 'You', customer: who(c) }[m.from] || m.from;
  return m.status === 'failed' || m.status === 'undelivered' ? base + ' · not delivered' : base;
}

function threadHtml(c) {
  const nameForm = `<form class="name-form" data-name="${c.id}"><label for="name-box" hidden>Customer name</label><input id="name-box" placeholder="Their name" maxlength="60" autocomplete="off" value="${esc(c.name || '')}"><button class="btn" type="submit">Save</button></form>`;
  return `
    <div class="thread">
      <div class="thread-head">
        <button type="button" class="back" data-back><span aria-hidden="true">←</span> All texts</button>
        <span class="av big ${c.status}" aria-hidden="true">${esc(initials(c))}</span>
        <div class="thread-who">
          ${c.name && !editingName
            ? `<span class="name-row"><b>${esc(c.name)}</b><button type="button" class="edit" data-edit-name aria-label="Edit name">Edit</button></span>`
            : nameForm}
          <span class="thread-phone">#${esc(c.id)} · ${esc(c.phone)} · ${dayName(c.daysAgo)} ${esc(c.time)}</span>
        </div>
        <span class="pill ${c.status}">${STATUS[c.status]}</span>
      </div>
      <div class="msgs" id="msgs">
        <p class="sys missed"><i aria-hidden="true"></i>Missed call · ${dayName(c.daysAgo)} ${esc(c.time)}</p>
        ${c.messages.map(m => `<div class="msg ${m.from}${m.status === 'failed' || m.status === 'undelivered' ? ' failed' : ''}"><p>${esc(m.text)}</p><small>${esc(messageLabel(m, c))}</small></div>`).join('')}
        ${{
          booked: `<p class="sys booked">Booked · ${money(c.value)}</p>`,
          'opted-out': '<p class="sys stop">Texted STOP. No more texts go to this number.</p>',
          gathering: `<div class="typing"><span></span><span></span><span></span><small>Waiting for ${esc(firstName(c))} to answer the AI</small></div>`,
          'no-reply': '<p class="sys quiet">No reply yet</p>'
        }[c.status] || ''}
      </div>
      ${c.status === 'opted-out' ? '' : `<div class="quick" aria-label="Quick replies">${quickReplies(c).map(q => `<button type="button" data-quick="${esc(q)}">${esc(q.trim())}</button>`).join('')}</div>`}
      <form class="composer" data-reply="${c.id}">
        <label for="reply-box" hidden>Reply</label>
        <input id="reply-box" placeholder="Text ${esc(who(c))}…" maxlength="640" autocomplete="off">
        <button class="btn btn-main" type="submit">Send</button>
      </form>
    </div>`;
}

// The right side: where this job stands, what to do next, and everything the AI found out.
function jobPanel(c) {
  const d = c.details;
  const total = checklist().length;
  const got = detailsIn(c);
  const unsure = d ? checklist().filter(i => d.items[i.key] === 'not sure') : [];
  const state = {
    booked: ['Booked', `A ${money(c.value)} job. Clicked it by mistake? Undo puts it back.`],
    ready: ['Ready to book', `Every detail is in. Text or call ${esc(firstName(c))} to set a time.`],
    waiting: d?.timingAsked
      ? ['Waiting on you', `${esc(firstName(c))} asked when someone can come. Text them a time.`]
      : ['Waiting on you', `${esc(firstName(c))} texted and is waiting for your answer.`],
    gathering: ['AI is asking', `${got} of ${total} details in. It keeps going until it has every one.`],
    replied: ['You replied', 'Now waiting on them to answer.'],
    'no-reply': ['No reply yet', "They got the auto-text but haven't written back."],
    'opted-out': ['Texted STOP', "They opted out, so you can't text them anymore."]
  }[c.status] || [STATUS[c.status] || c.status, ''];

  return `
    <aside class="job-panel" aria-label="Job">
      <div class="state ${c.status}">
        <span class="state-label">${state[0]}${c.status === 'booked' ? ' ' + money(c.value) : ''}</span>
        <p>${state[1]}</p>
        ${c.status === 'gathering' ? `<span class="meter" aria-hidden="true"><i style="width: ${Math.round(got / total * 100)}%"></i></span>` : ''}
      </div>

      <div class="actions">
        <a class="btn" href="${telLink(c)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>Call</a>
        <button type="button" class="btn" data-focus-reply><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>Text</button>
      </div>
      ${c.status === 'booked'
        ? `<button type="button" class="btn undo" data-unbook="${c.id}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>Undo booked</button>`
        : `<form class="book-form" data-book="${c.id}">
             <label for="job-value" hidden>Job value</label>
             <input id="job-value" inputmode="numeric" placeholder="Job $" aria-label="Job value in dollars">
             <button class="btn btn-main" type="submit">Mark booked</button>
           </form>`}

      ${d ? `
        <div class="checklist">
          <h3>Job details <span class="ring-mini"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${Math.round(got / total * 100)} 100"/></svg>${got}/${total}</span></h3>
          ${d.done && unsure.length ? `<p class="unsure-note">Not sure about ${unsure.map(i => i.label.toLowerCase()).join(', ')}. Ask when you call.</p>` : ''}
          <ul>
            ${checklist().map(i => {
              const v = d.items[i.key];
              const kind = !v ? 'todo' : v === 'not sure' ? 'unsure' : 'got';
              const shown = kind === 'got' ? esc(v) : kind === 'unsure' ? 'Not sure' : c.status === 'gathering' ? 'Still asking…' : 'Not given';
              return `<li class="${kind}"><span class="tick" aria-hidden="true"></span><span class="lbl">${esc(i.label)}</span><b>${shown}</b></li>`;
            }).join('')}
          </ul>
        </div>`
      : c.summary ? `<div class="checklist"><h3>Job details</h3><p class="plain-summary">${esc(c.summary)}</p></div>` : ''}
    </aside>`;
}

// ---------- Page: Settings ----------

// Texts are sent in 160-character pieces (70 if the message has emoji or special symbols).
function textPieces(message) {
  const plain = /^[\x20-\x7E\n\r]*$/.test(message);
  const single = plain ? 160 : 70, multi = plain ? 153 : 67;
  return message.length <= single ? 1 : Math.ceil(message.length / multi);
}

function autotextPage() {
  const a = data.autoText;
  const section = (n, title, body) => `
    <section class="set"><span class="num" aria-hidden="true">${n}</span><div class="set-body"><h2>${title}</h2>${body}</div></section>`;
  return `
    <header class="page-top">
      <h1 class="page-title">Settings<span class="hi">.</span></h1>
    </header>

    <div class="settings">
      <div class="settings-main">
        ${section('01', 'The first text', `
          <p class="note">Every missed caller gets this. Write {business} and it fills in your company name.</p>
          <div class="field">
            <label for="msg-main">When you're open</label>
            <textarea id="msg-main" maxlength="480">${esc(a.message)}</textarea>
            <div class="meta" id="meta-main"></div>
          </div>
          <div class="field">
            <label for="contact-line">Contact line</label>
            <input id="contact-line" maxlength="160" value="${esc(a.contactLine || '')}" placeholder="12 King St W, Hamilton ON, mikesplumbing.ca">
            <p class="note">Canada's anti-spam law (CASL) needs your mailing address and a phone, email or website in business texts. It goes at the end, before "Reply STOP to opt out." Plain keyboard characters only: one emoji makes every text cost double.</p>
          </div>`)}

        ${section('02', 'When you’re closed', `
          <label class="toggle" for="ah-on"><input type="checkbox" id="ah-on" ${a.afterHoursOn ? 'checked' : ''}>Send a different text when you're closed</label>
          <div class="field">
            <textarea id="msg-after" maxlength="480" aria-label="Closed text" ${a.afterHoursOn ? '' : 'disabled'}>${esc(a.afterHoursMessage)}</textarea>
            <div class="meta" id="meta-after"></div>
          </div>`)}

        ${section('03', 'Next-day follow-up', `
          <label class="toggle" for="fu-on"><input type="checkbox" id="fu-on" ${a.followUpOn ? 'checked' : ''}>Follow up the next day if they don't reply</label>
          <div class="field">
            <textarea id="msg-follow" maxlength="480" aria-label="Follow-up text" ${a.followUpOn ? '' : 'disabled'}>${esc(a.followUpMessage || '')}</textarea>
            <p class="note">Sent once, about a day later, while you're open. Skipped if they wrote back, you texted them, or they texted STOP.</p>
          </div>`)}

        ${section('04', 'Assistant and alerts', `
          <label class="toggle" for="intake-on"><input type="checkbox" id="intake-on" ${a.intakeOn ? 'checked' : ''}>Have the AI get every job detail first, then text me one summary</label>
          <ol class="checklist-chips" aria-label="What the AI gets from every caller">
            ${checklist().map(i => `<li>${esc(i.label)}</li>`).join('')}
          </ol>
          <label class="toggle" for="notify-on"><input type="checkbox" id="notify-on" ${a.notifyOwner ? 'checked' : ''}>Text me at ${esc(data.business.ownerPhone)} when a customer replies</label>
          <div class="summary-row">
            <label class="toggle" for="summary-on"><input type="checkbox" id="summary-on" ${a.summaryOn ? 'checked' : ''}>Text me a morning summary at</label>
            <input id="summary-time" aria-label="Summary time" value="${esc(a.summaryTime || '7:00 AM')}" ${a.summaryOn ? '' : 'disabled'}>
          </div>`)}

        ${section('05', 'Business hours', `
          <p class="note">Outside these hours, callers get the "closed" text. Type times like 7:00 AM.</p>
          <div class="hours-edit">
            ${data.hours.map((h, i) => `
              <div class="hours-row">
                <label class="toggle" for="open-${i}"><input type="checkbox" id="open-${i}" data-day="${i}" ${h.open ? 'checked' : ''}>${h.day}</label>
                <input id="from-${i}" aria-label="${h.day} opens" value="${esc(h.open || '7:00 AM')}" ${h.open ? '' : 'disabled'}>
                <span>to</span>
                <input id="to-${i}" aria-label="${h.day} closes" value="${esc(h.close || '6:00 PM')}" ${h.open ? '' : 'disabled'}>
              </div>`).join('')}
          </div>`)}

        ${section('06', 'Never text these numbers', `
          <div class="field">
            <textarea id="never-text" aria-label="Never text these numbers" placeholder="(905) 555-0123">${esc((a.neverText || []).join('\n'))}</textarea>
            <p class="note">One number per line. Family, friends, suppliers: their missed calls won't get a text.</p>
          </div>`)}

        ${section('07', 'Setup', `
          <ul class="checks">${data.setup.map(s => `<li class="${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ul>
          <p class="note">Your Ringleader number: <b>${esc(data.business.ringleaderNumber || 'not set up yet')}</b></p>`)}

        <div class="save-row">
          <button class="btn btn-main" type="button" id="save">Save changes</button>
        </div>
      </div>

      <aside class="phone-preview" aria-label="What the customer sees">
        <div class="phone">
          <p class="from"><b>${esc(data.business.name)}</b>${esc(data.business.ringleaderNumber)}</p>
          <div class="bubble" id="preview-bubble"></div>
        </div>
        <div class="tabs" role="group" aria-label="Preview which text">
          <button type="button" data-preview="main" aria-pressed="${previewWhich === 'main'}">Open</button>
          <button type="button" data-preview="after" aria-pressed="${previewWhich === 'after'}">Closed</button>
        </div>
      </aside>
    </div>
  `;
}

let previewWhich = 'main';
function updateAutotext() {
  const mainBox = document.getElementById('msg-main');
  const afterBox = document.getElementById('msg-after');
  const contact = document.getElementById('contact-line').value;
  [['main', mainBox], ['after', afterBox]].forEach(([key, box]) => {
    const text = autoTextOf(box.value, contact);
    const pieces = textPieces(text);
    document.getElementById('meta-' + key).innerHTML =
      `<span><b>${text.length}</b> characters as sent</span><span><b>${pieces}</b> text${pieces > 1 ? 's' : ''} per missed call</span>`;
  });
  const source = previewWhich === 'after' && document.getElementById('ah-on').checked ? afterBox : mainBox;
  document.getElementById('preview-bubble').textContent = source.value.trim() ? autoTextOf(source.value, contact) : '…';
}

function readSettingsForm() {
  return {
    message: document.getElementById('msg-main').value,
    afterHoursMessage: document.getElementById('msg-after').value,
    afterHoursOn: document.getElementById('ah-on').checked,
    contactLine: document.getElementById('contact-line').value,
    notifyOwner: document.getElementById('notify-on').checked,
    intakeOn: document.getElementById('intake-on').checked,
    followUpOn: document.getElementById('fu-on').checked,
    followUpMessage: document.getElementById('msg-follow').value,
    summaryOn: document.getElementById('summary-on').checked,
    summaryTime: document.getElementById('summary-time').value,
    neverText: document.getElementById('never-text').value.split('\n').map(n => n.trim()).filter(Boolean),
    hours: data.hours.map((h, i) => document.getElementById('open-' + i).checked
      ? { day: h.day, open: document.getElementById('from-' + i).value.trim().toUpperCase().replace(/\s*(AM|PM)$/, ' $1'), close: document.getElementById('to-' + i).value.trim().toUpperCase().replace(/\s*(AM|PM)$/, ' $1') }
      : { day: h.day, open: null, close: null })
  };
}

// ---------- Page: Next up (Front Desk and Crew, not built yet) ----------

function soonPage() {
  const plans = [
    {
      name: 'Front Desk', price: 349,
      intro: 'Everything in Text-Back, plus an AI that answers your calls out loud, day and night.',
      adds: [
        ['Calls answered', 'How many calls the AI picked up, and how long each one took.'],
        ['Emergencies', 'Gas, flooding or sparks go straight to your on-call phone.'],
        ['Booked into your calendar', 'Jobs scheduled without you touching the phone.'],
        ['Call summaries', 'A short summary of every call, so you never listen back.']
      ]
    },
    {
      name: 'Crew', price: 599,
      intro: 'Everything in Front Desk, for shops with more than one line or a dispatcher.',
      adds: [
        ['Up to 3 phone lines', 'Results for each line, or all together.'],
        ['English and Spanish', 'Either language, with a summary in English.'],
        ['Job software sync', 'Booked jobs go straight into the software you already use.'],
        ['Monthly review', 'A call with us each month to tune what the AI says.']
      ]
    }
  ];
  return `
    <header class="soon-hero">
      <h1 class="page-title">Next <span class="hi">up.</span></h1>
      <p class="hero-sub">You have Text-Back. These plans turn on here when they're ready.</p>
      <div class="tape-band" aria-hidden="true"></div>
    </header>
    <section class="soon-grid">
      ${plans.map((p, i) => `
        <article class="plan ${i === 0 ? 'feature' : ''}">
          <span class="soon-tag">Coming soon</span>
          <h2>${p.name}</h2>
          <p class="price">$${p.price}<small> /month</small></p>
          <p class="note">${p.intro}</p>
          <ul>${p.adds.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
        </article>`).join('')}
    </section>
  `;
}

// ---------- Drawing the right page ----------

const PAGES = {
  overview: overviewPage,
  conversations: conversationsPage,
  autotext: autotextPage,
  frontdesk: soonPage,
  crew: soonPage
};
const currentPage = () => location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'overview';

// Animations play when a page opens, not on the quiet refresh every 15 seconds.
let animateNext = true;

function render() {
  const page = currentPage();
  const animate = animateNext;
  animateNext = false;
  main.className = 'main' + (animate ? ' animate' : '');
  main.innerHTML = PAGES[page]();
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page || (page === 'crew' && a.dataset.page === 'frontdesk')));
  document.getElementById('biz-name').textContent = data.business.name;
  document.getElementById('waiting-count').textContent = stats().waiting || '';
  const chip = document.getElementById('side-foot');
  chip.className = 'mode ' + mode;
  chip.textContent = mode === 'live' ? 'Live' : mode === 'test' ? 'Test mode' : 'Example data';
  chip.title = mode === 'live' ? 'Texts send from ' + data.business.ringleaderNumber : mode === 'test' ? 'No real texts are sent' : 'Start the server to see real calls';
  if (page === 'autotext') updateAutotext();
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  if (animate) countUp();
  // fx.js listens for this to draw the call radar and the menu highlight
  window.dispatchEvent(new CustomEvent('rl:render', { detail: { page, animate } }));
}

// The big dollar number counts up from zero.
function countUp() {
  const el = main.querySelector('[data-count]');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = Number(el.dataset.count);
  if (!target) return;
  const start = performance.now(), ms = 1400;
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = money(target * (1 - Math.pow(1 - t, 4)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function refresh() {
  await load();
  render();
}

window.addEventListener('hashchange', () => {
  if (currentPage() !== 'conversations') chatOpen = chatInHistory = false;
  animateNext = true; render(); window.scrollTo(0, 0);
});

// Phones: close the open chat and show the list again.
function closeChat() {
  if (chatInHistory) { history.back(); return; } // the popstate below does the rest
  chatOpen = false;
  render(); window.scrollTo(0, 0);
}
// The phone's Back button (or swipe back) closes an open chat instead of leaving the page.
window.addEventListener('popstate', () => {
  if (!chatInHistory) return;
  chatOpen = chatInHistory = false;
  render(); window.scrollTo(0, 0);
});
// Tapping "Texts" in the menu while a chat is open goes back to the list.
document.querySelector('.nav').addEventListener('click', e => {
  if (e.target.closest('[data-page="conversations"]') && currentPage() === 'conversations' && chatOpen) {
    e.preventDefault();
    closeChat();
  }
});

// Check for new texts every 15 seconds, unless you're in the middle of typing.
setInterval(() => {
  if (mode === 'example' || document.hidden) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (typing || currentPage() === 'autotext') return;
  const y = window.scrollY;
  refresh().then(() => window.scrollTo(0, y));
}, 15000);

// ---------- Chart hover labels ----------

const tip = document.getElementById('tip');
document.addEventListener('pointermove', e => {
  const target = e.target.closest?.('[data-tip]');
  if (!target) { tip.hidden = true; return; }
  tip.textContent = target.dataset.tip;
  tip.style.left = e.clientX + 'px';
  tip.style.top = e.clientY + 'px';
  tip.hidden = false;
});
document.addEventListener('pointerleave', () => { tip.hidden = true; });

// ---------- Clicks and typing ----------

main.addEventListener('toggle', e => {
  if (e.target.classList.contains('sim')) testInputs.open = e.target.open;
}, true);

main.addEventListener('click', async e => {
  const rangeBtn = e.target.closest('[data-range]');
  if (rangeBtn) { range = Number(rangeBtn.dataset.range); animateNext = true; render(); return; }
  const open = e.target.closest('[data-open]');
  if (open) {
    openId = Number(open.dataset.open);
    editingName = false;
    chatOpen = true;
    if (location.hash === '#conversations') {
      e.preventDefault();
      if (isPhone() && !chatInHistory) { history.pushState({ chat: true }, ''); chatInHistory = true; }
      render();
      if (isPhone()) window.scrollTo(0, 0);
    }
    return;
  }
  if (e.target.closest('[data-back]')) { closeChat(); return; }
  if (e.target.closest('[data-edit-name]')) {
    editingName = true;
    render();
    document.getElementById('name-box')?.focus();
    return;
  }
  if (e.target.closest('[data-focus-reply]')) { document.getElementById('reply-box')?.focus(); return; }
  const quick = e.target.closest('[data-quick]');
  if (quick) {
    const box = document.getElementById('reply-box');
    box.value = quick.dataset.quick;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return;
  }
  const unbook = e.target.closest('[data-unbook]');
  if (unbook) { await undoBooked(Number(unbook.dataset.unbook)); return; }
  const f = e.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; render(); return; }
  const pv = e.target.closest('[data-preview]');
  if (pv) {
    previewWhich = pv.dataset.preview;
    document.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String(b === pv)));
    updateAutotext();
    return;
  }
  if (e.target.id === 'save') {
    const settings = readSettingsForm();
    if (mode === 'example') {
      Object.assign(data.autoText, settings);
      data.hours = settings.hours;
      toast('Saved on this page only. Start the server to save for real.');
      return;
    }
    try {
      await api('/api/settings', settings, 'PUT');
      await refresh();
      toast('Saved.');
    } catch (err) {
      toast(err.message, true);
    }
  }
});

main.addEventListener('input', e => {
  if (e.target.id === 'test-phone') testInputs.phone = e.target.value;
  if (e.target.id === 'test-text') testInputs.text = e.target.value;
  if (e.target.id === 'test-owner') testInputs.owner = e.target.value;
  if (e.target.id === 'summary-on') document.getElementById('summary-time').disabled = !e.target.checked;
  if (e.target.id === 'msg-main' || e.target.id === 'msg-after' || e.target.id === 'contact-line') updateAutotext();
  if (e.target.id === 'fu-on') document.getElementById('msg-follow').disabled = !e.target.checked;
  if (e.target.id === 'ah-on') {
    document.getElementById('msg-after').disabled = !e.target.checked;
    updateAutotext();
  }
  if (e.target.dataset.day !== undefined) {
    const i = e.target.dataset.day;
    document.getElementById('from-' + i).disabled = !e.target.checked;
    document.getElementById('to-' + i).disabled = !e.target.checked;
  }
});

main.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    if (form.dataset.reply) await sendReply(form);
    else if (form.dataset.book) await markBooked(form);
    else if (form.dataset.name) await saveName(form);
    else if (form.dataset.test === 'call') {
      const r = await api('/api/test/missed-call', { phone: document.getElementById('test-phone').value });
      toast(r.texted ? 'Missed call. Auto-text sent (see the server window).' : 'Missed call, but no text sent: ' + ({ 'recently-texted': 'they already got one in the last 12 hours', 'opted-out': 'they texted STOP', 'no-caller-id': 'no caller ID' }[r.reason] || r.reason) + '.');
      await refresh();
    } else if (form.dataset.test === 'text') {
      const r = await api('/api/test/customer-text', { phone: document.getElementById('test-phone').value, text: document.getElementById('test-text').value });
      toast(r.optedOut ? 'They texted STOP. No more texts will go to this number.' : r.assistant === 'ready' ? 'Every detail is in. The owner got the summary.' : r.assistant === 'waiting' ? 'Every detail is in. They asked about timing, so the owner is up.' : r.assistant ? 'The AI asked the next question.' : 'Customer reply received.');
      await refresh();
    } else if (form.dataset.test === 'owner') {
      const r = await api('/api/test/owner-text', { text: document.getElementById('test-owner').value });
      toast(r.sent ? `Your text went to #${r.conversationId}.` : 'Not sent: ' + (r.error || 'nobody to send it to. Check the # number, or simulate a customer reply first.'), !r.sent);
      await refresh();
    } else if (form.dataset.test === 'followup') {
      const r = await api('/api/test/follow-ups', {});
      toast(r.reason === 'off' ? 'Follow-ups are turned off in Settings.' : r.sent ? `Sent ${r.sent} follow-up${r.sent === 1 ? '' : 's'}.` : 'Nobody needs a follow-up. Simulate a missed call first, and don\'t reply to it.');
      await refresh();
    } else if (form.dataset.test === 'summary') {
      const r = await api('/api/test/morning-summary', {});
      testInputs.summary = r.text || 'Nothing happened in the last 24 hours, so no summary would be sent.';
      form.querySelector('.summary-preview').textContent = testInputs.summary;
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
});

async function sendReply(form) {
  const box = form.querySelector('input');
  const text = box.value.trim();
  if (!text) return;
  const id = Number(form.dataset.reply);
  if (mode === 'example') {
    const c = data.conversations.find(x => x.id === id);
    c.messages.push({ from: 'owner', text });
    if (c.status !== 'booked') c.status = 'replied';
    render();
  } else {
    await api(`/api/conversations/${id}/reply`, { text });
    await refresh();
  }
  document.getElementById('reply-box')?.focus();
}

async function markBooked(form) {
  const value = form.querySelector('input').value;
  const id = Number(form.dataset.book);
  if (mode === 'example') {
    const c = data.conversations.find(x => x.id === id);
    c.status = 'booked';
    c.value = Number(value.replace(/[^0-9.]/g, '')) || 0;
    render();
  } else {
    await api(`/api/conversations/${id}/book`, { value });
    await refresh();
  }
  toast('Marked as booked.');
}

async function undoBooked(id) {
  try {
    if (mode === 'example') {
      const c = data.conversations.find(x => x.id === id);
      c.status = c.details?.done && !c.details.timingAsked ? 'ready' : 'waiting';
      c.value = 0;
      render();
    } else {
      await api(`/api/conversations/${id}/unbook`, {});
      await refresh();
    }
    toast('Undone. It is not booked anymore.');
  } catch (err) {
    toast(err.message, true);
  }
}

async function saveName(form) {
  const name = form.querySelector('input').value.trim();
  if (!name) return;
  const id = Number(form.dataset.name);
  editingName = false;
  if (mode === 'example') {
    data.conversations.find(x => x.id === id).name = name;
    render();
  } else {
    await api(`/api/conversations/${id}/name`, { name });
    await refresh();
  }
}

refresh();

// Typing in the search box redraws just the list, so the box keeps your cursor.
main.addEventListener('input', e => {
  if (e.target.id !== 'search') return;
  search = e.target.value;
  const list = main.querySelector('.inbox-list');
  if (list) list.innerHTML = listHtml(shownList());
});
