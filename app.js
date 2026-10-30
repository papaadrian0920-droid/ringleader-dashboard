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
  gathering: 'Getting details',
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
const thisWeek = () => data.conversations.filter(c => c.daysAgo <= 6);

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
  const week = thisWeek();
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

// The last 7 days, oldest first, each with its conversations.
function weekDays() {
  return [6, 5, 4, 3, 2, 1, 0].map(ago => ({
    ago,
    label: ago === 0 ? 'Today' : new Date(Date.now() - ago * 864e5).toLocaleDateString('en-US', { weekday: 'short' }),
    list: data.conversations.filter(c => c.daysAgo === ago)
  }));
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
      : 'Example data. Start the server to see your real calls.';

  return `
    <section class="hero" aria-label="This week">
      <div class="hero-copy">
        <p class="kicker"><span class="pulse"></span>Last 7 days</p>
        <h1>${esc(greeting())}</h1>
        <p class="hero-money" data-count="${s.money}">${money(s.money)}</p>
        <p class="hero-sub">${s.money ? `in jobs booked from <span class="hi">calls you missed</span>.` : 'in booked jobs so far. They stack up here as calls turn into work.'}</p>
        <p class="status-line">${statusLine}</p>
      </div>
      <div class="hero-chart">${heroChart()}</div>
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

    <section class="card week">
      <div class="card-head">
        <h2>Missed calls by day</h2>
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
    gathering: `Getting details from ${who(c)}`,
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

// Hero chart: booked dollars adding up over the week.
function heroChart() {
  const days = weekDays();
  let total = 0;
  const daily = days.map(d => d.list.filter(c => c.status === 'booked').reduce((sum, c) => sum + c.value, 0));
  const running = daily.map(v => (total += v));
  const W = 560, H = 250, P = 14, B = 34;
  const max = Math.max(...running, 1);
  const x = i => P + i * (W - 2 * P) / 6;
  const y = v => P + (H - P - B) * (1 - v / max);
  const pts = running.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${x(6)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = pts[6];
  const hits = days.map((d, i) => `<rect x="${x(i) - (W - 2 * P) / 12}" y="0" width="${(W - 2 * P) / 6}" height="${H}" fill="transparent" data-tip="${esc(d.label)}: ${money(daily[i])} booked, ${money(running[i])} so far"/>`).join('');
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Booked dollars adding up over the last 7 days, ${money(total)} in total">
      <defs>
        <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#C8FF2E" stop-opacity=".45"/>
          <stop offset="1" stop-color="#C8FF2E" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-width="1"/>
      <path class="fade-in" d="${area}" fill="url(#heroFill)"/>
      <path class="draw" d="${line}" fill="none" stroke="#C8FF2E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(([px, py], i) => daily[i] ? `<circle class="fade-in" cx="${px}" cy="${py}" r="4.5" fill="var(--bg)" stroke="#C8FF2E" stroke-width="2"/>` : '').join('')}
      <circle class="fade-in" cx="${last[0]}" cy="${last[1]}" r="16" fill="#C8FF2E" opacity=".18"/>
      <circle class="fade-in" cx="${last[0]}" cy="${last[1]}" r="7" fill="#C8FF2E"/>
      ${days.map((d, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--soft)" font-family="IBM Plex Mono, monospace">${esc(d.label)}</text>`).join('')}
      ${hits}
    </svg>`;
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

// Stacked columns: booked (green), texted back (grey), no reply (dark).
function weekChart() {
  const days = weekDays().map(d => {
    const booked = d.list.filter(c => c.status === 'booked').length;
    const replied = d.list.filter(customerReplied).length - booked;
    return { ...d, booked, replied: Math.max(0, replied), none: d.list.length - Math.max(booked, d.list.filter(customerReplied).length) };
  });
  const W = 960, H = 250, L = 30, B = 34, T = 30;
  const max = Math.max(4, ...days.map(d => d.list.length));
  const step = (W - L) / 7, bw = Math.min(64, step * 0.58);
  const y = v => T + (H - T - B) * (1 - v / max);
  const unit = (H - T - B) / max;
  let svg = '';
  const tickStep = max > 8 ? Math.ceil(max / 4) : 2;
  for (let v = 0; v <= max; v += tickStep) {
    svg += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="${v ? '3 5' : ''}"/>`;
    svg += `<text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--soft)" font-family="IBM Plex Mono, monospace">${v}</text>`;
  }
  days.forEach((d, i) => {
    const x = L + i * step + (step - bw) / 2;
    let base = y(0);
    let col = '';
    [[d.booked, '#C8FF2E'], [d.replied, '#8C8C86'], [d.none, '#3A3A40']].forEach(([n, color]) => {
      if (!n) return;
      const h = n * unit;
      col += `<rect x="${x}" y="${base - h + 1}" width="${bw}" height="${Math.max(h - 2, 2)}" rx="6" fill="${color}"/>`;
      base -= h;
    });
    const tip = `${d.label}: ${d.list.length} missed, ${d.booked + d.replied} texted back, ${d.booked} booked`;
    svg += `<g class="col" style="--i: ${i}">${col}</g>`;
    if (d.list.length) svg += `<text x="${x + bw / 2}" y="${y(d.list.length) - 10}" text-anchor="middle" font-size="18" font-weight="900" fill="var(--ink)" font-family="Archivo, sans-serif">${d.list.length}</text>`;
    svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="13" font-weight="600" fill="${d.ago === 0 ? '#C8FF2E' : 'var(--soft)'}" font-family="IBM Plex Mono, monospace">${esc(d.label)}</text>`;
    svg += `<rect x="${L + i * step}" y="0" width="${step}" height="${H}" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Missed calls per day for the last 7 days">${svg}</svg>`;
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
let openId = null;

function conversationsPage() {
  const list = data.conversations.filter(c =>
    filter === 'all' ? true : filter === 'waiting' ? needsYou(c) : c.status === 'booked');
  if (!list.some(c => c.id === openId)) openId = list[0] ? list[0].id : null;
  const c = data.conversations.find(x => x.id === openId);

  return `
    <header class="page-top">
      <h1 class="page-title">Texts<span class="hi">.</span></h1>
      <div class="tabs" role="group" aria-label="Filter conversations">
        ${['all', 'waiting', 'booked'].map(f => `<button type="button" data-filter="${f}" aria-pressed="${filter === f}">${f === 'all' ? 'All' : f === 'waiting' ? 'Needs you' : 'Booked'}</button>`).join('')}
      </div>
    </header>

    <section class="inbox">
      <div class="inbox-list">
        ${list.length ? list.map(x => `
          <button type="button" data-open="${x.id}" class="${x.id === openId ? 'active' : ''}">
            <span class="top"><b>${esc(who(x))}</b><time>${dayName(x.daysAgo)}</time></span>
            <span class="preview">${esc(lastText(x))}</span>
            <span><span class="pill ${x.status}">${STATUS[x.status]}${x.status === 'booked' ? ' ' + money(x.value) : ''}</span></span>
          </button>`).join('') : `<p class="empty" style="padding: 14px">Nothing here yet.</p>`}
      </div>
      ${c ? threadHtml(c) : `<div class="thread"><p class="empty" style="padding: 24px">Pick a conversation.</p></div>`}
    </section>
  `;
}

function messageLabel(m, c) {
  const base = { auto: 'Auto-text', followup: 'Follow-up', assistant: 'Assistant', owner: 'You', customer: who(c) }[m.from] || m.from;
  return m.status === 'failed' || m.status === 'undelivered' ? base + ' · not delivered' : base;
}

function threadHtml(c) {
  return `
    <div class="thread">
      <div class="thread-head">
        <div class="thread-who">
          ${c.name
            ? `<b>${esc(c.name)}</b>`
            : `<form class="name-form" data-name="${c.id}"><label for="name-box" hidden>Customer name</label><input id="name-box" placeholder="Add their name" maxlength="60" autocomplete="off"><button class="btn" type="submit">Save</button></form>`}
          <span class="thread-phone">#${esc(c.id)} · ${esc(c.phone)} · ${dayName(c.daysAgo)} ${esc(c.time)}</span>
        </div>
        ${c.status === 'booked'
          ? `<span class="booked-stamp">Booked ${money(c.value)}</span>`
          : `<form class="book-form" data-book="${c.id}">
               <label for="job-value" hidden>Job value</label>
               <input id="job-value" inputmode="numeric" placeholder="Job $" aria-label="Job value in dollars">
               <button class="btn btn-main" type="submit">Mark booked</button>
             </form>`}
      </div>
      ${c.summary ? `<div class="job-card${c.status === 'ready' ? ' ready' : ''}"><span>${c.status === 'ready' ? 'Ready to book' : 'Job details'}</span><p>${esc(c.summary)}</p></div>` : '<div></div>'}
      <div class="msgs" id="msgs">
        ${c.messages.map(m => `<div class="msg ${m.from}${m.status === 'failed' || m.status === 'undelivered' ? ' failed' : ''}"><p>${esc(m.text)}</p><small>${esc(messageLabel(m, c))}</small></div>`).join('')}
      </div>
      <form class="composer" data-reply="${c.id}">
        <label for="reply-box" hidden>Reply</label>
        <input id="reply-box" placeholder="Text ${esc(who(c))}…" maxlength="640" autocomplete="off">
        <button class="btn btn-main" type="submit">Send</button>
      </form>
    </div>`;
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
          <label class="toggle" for="intake-on"><input type="checkbox" id="intake-on" ${a.intakeOn ? 'checked' : ''}>Ask callers for the job details first (name, address, how urgent, best time), then text me one summary</label>
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

        ${section('06', 'Setup', `
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

window.addEventListener('hashchange', () => { animateNext = true; render(); window.scrollTo(0, 0); });

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
  const open = e.target.closest('[data-open]');
  if (open) {
    openId = Number(open.dataset.open);
    if (location.hash === '#conversations') { e.preventDefault(); render(); }
    return;
  }
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
      toast(r.optedOut ? 'They texted STOP. No more texts will go to this number.' : r.assistant === 'ready' ? 'Ready to book. The owner got the summary.' : r.assistant ? 'The assistant asked the next question.' : 'Customer reply received.');
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

async function saveName(form) {
  const name = form.querySelector('input').value.trim();
  if (!name) return;
  const id = Number(form.dataset.name);
  if (mode === 'example') {
    data.conversations.find(x => x.id === id).name = name;
    render();
  } else {
    await api(`/api/conversations/${id}/name`, { name });
    await refresh();
  }
}

refresh();
