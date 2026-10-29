// Ringleader dashboard
// Gets its data from the server (/api/dashboard) and draws one page at a time.
// If there's no server (you opened the file by itself), it shows the example data from data.js.
// The page shown depends on the end of the address: #overview, #conversations, #autotext, #frontdesk, #crew.

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

const STATUS = {
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
      if (first && first.from === 'auto' && !first.text) first.text = withOptOut(fill(data.autoText.message));
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
    waiting: data.conversations.filter(c => c.status === 'waiting').length
  };
}

const pct = (part, whole) => whole ? Math.round((part / whole) * 100) + '%' : '–';

// ---------- Page: Overview ----------

function overviewPage() {
  const s = stats();
  const waiting = data.conversations.filter(c => c.status === 'waiting');
  const recent = data.conversations.filter(c => c.status !== 'waiting').slice(0, 6);
  const statusLine = mode === 'live'
    ? `Text-Back is on. Calls you miss on ${esc(data.business.ownerPhone)} get a text in about 5 seconds.`
    : mode === 'test'
      ? 'Test mode. Nothing is really sent. Use the buttons below to try it.'
      : `Example data. Calls you miss on ${esc(data.business.ownerPhone)} would get a text in about 5 seconds.`;

  return `
    <header class="page-head">
      <p class="label">Text-Back · last 7 days</p>
      <h1>${esc(greeting())}</h1>
      <p class="status-line"><span class="dot ${mode === 'live' ? '' : 'off'}"></span>${statusLine}</p>
    </header>

    ${mode === 'test' ? testPanel() : ''}

    <section class="block" aria-label="This week's results">
      <div class="flow">
        <div><b>${s.missed}</b><span>Missed calls</span></div>
        <div><b>${s.texted}</b><span>Got a text back</span><span class="pct">${pct(s.texted, s.missed)}</span></div>
        <div><b>${s.replied}</b><span>Texted you back</span><span class="pct">${pct(s.replied, s.texted)}</span></div>
        <div><b>${s.booked}</b><span>Booked jobs</span><span class="pct">${pct(s.booked, s.replied)}</span></div>
      </div>
      <p class="money"><b>${money(s.money)}</b><span>in jobs booked from calls you would have missed</span></p>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>Waiting on you</h2>
        ${waiting.length ? `<a class="link" href="#conversations">Open conversations</a>` : ''}
      </div>
      ${waiting.length ? `<div class="rows">${waiting.map(rowHtml).join('')}</div>`
        : `<p class="empty">You're all caught up.</p>`}
    </section>

    <section class="block chart">
      <div class="block-head">
        <h2>Missed calls by day</h2>
        <div class="legend"><span><i style="background: var(--ink)"></i>Texted you back</span><span><i style="background: var(--bar)"></i>No reply</span></div>
      </div>
      ${chartSvg()}
    </section>

    <section class="block">
      <h2>Recent</h2>
      ${recent.length ? `<div class="rows">${recent.map(rowHtml).join('')}</div>`
        : `<p class="empty">No missed calls yet. When a call is missed, it shows up here.</p>`}
    </section>
  `;
}

// Only in test mode: pretend to be a caller.
// The number and text are kept here so they stay the same after the page refreshes.
const testInputs = {
  phone: '(555) 014-' + String(Math.floor(1000 + Math.random() * 9000)),
  text: 'Hi, my water heater is leaking. Can someone come today?',
  owner: 'I can be there at 2 today. Does that work?'
};
function testPanel() {
  return `
    <section class="test-panel" aria-label="Test tools">
      <p class="label">Try it</p>
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
        <label for="test-owner">You text back from your phone</label>
        <input id="test-owner" value="${esc(testInputs.owner)}" autocomplete="off">
        <button class="btn" type="submit">Simulate your text</button>
      </form>
      <p class="note">The reply comes from the caller's number above. Try calling twice (only one text goes out), or texting STOP. Your text goes to whoever texted last, or start it with # and a number, like #3, to pick someone.</p>
    </section>`;
}

function rowHtml(c) {
  return `
    <a class="row" href="#conversations" data-open="${c.id}">
      <span class="row-main">
        <span class="row-who">${esc(who(c))}${c.name ? `<small>${esc(c.phone)}</small>` : ''}</span>
        <span class="row-text">${esc(lastText(c))}</span>
      </span>
      <span class="row-side">
        <span class="pill ${c.status}">${STATUS[c.status]}${c.status === 'booked' ? ' · ' + money(c.value) : ''}</span>
        <time>${dayName(c.daysAgo)} ${esc(c.time)}</time>
      </span>
    </a>`;
}

// A simple stacked bar chart: dark part = customer texted back, grey part = no reply.
function chartSvg() {
  const days = [6, 5, 4, 3, 2, 1, 0].map(ago => {
    const list = data.conversations.filter(c => c.daysAgo === ago);
    return { label: ago === 0 ? 'Today' : dayName(ago).slice(0, 3), total: list.length, replied: list.filter(customerReplied).length };
  });
  const W = 640, H = 200, L = 28, B = 28, T = 12;
  const max = Math.ceil(Math.max(4, ...days.map(d => d.total)) / 2) * 2;
  const step = (W - L) / days.length;
  const bw = step * 0.5;
  const y = v => T + (H - T - B) * (1 - v / max);
  let svg = '';
  for (let v = 0; v <= max; v += max > 10 ? 4 : 2) {
    svg += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`;
    svg += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--faint)" font-family="IBM Plex Mono, monospace">${v}</text>`;
  }
  days.forEach((d, i) => {
    const x = L + i * step + (step - bw) / 2;
    if (d.total) svg += `<rect x="${x}" y="${y(d.total)}" width="${bw}" height="${y(0) - y(d.total)}" rx="3" fill="var(--bar)"><title>${d.label}: ${d.total} missed</title></rect>`;
    if (d.replied) svg += `<rect x="${x}" y="${y(d.replied)}" width="${bw}" height="${y(0) - y(d.replied)}" rx="3" fill="var(--ink)"><title>${d.label}: ${d.replied} texted back</title></rect>`;
    svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Missed calls per day for the last 7 days">${svg}</svg>`;
}

// ---------- Page: Conversations ----------

let filter = 'all';
let openId = null;

function conversationsPage() {
  const list = data.conversations.filter(c =>
    filter === 'all' ? true : filter === 'waiting' ? c.status === 'waiting' : c.status === 'booked');
  if (!list.some(c => c.id === openId)) openId = list[0] ? list[0].id : null;
  const c = data.conversations.find(x => x.id === openId);

  return `
    <header class="page-head">
      <p class="label">Text-Back</p>
      <h1>Conversations</h1>
      <p class="status-line">Every missed call starts a text conversation. Reply here and it texts the customer from ${esc(data.business.ringleaderNumber || 'your Ringleader number')}.</p>
    </header>

    <section class="block">
      <div class="tabs" role="group" aria-label="Filter conversations">
        ${['all', 'waiting', 'booked'].map(f => `<button type="button" data-filter="${f}" aria-pressed="${filter === f}">${f === 'all' ? 'All' : f === 'waiting' ? 'Waiting on you' : 'Booked'}</button>`).join('')}
      </div>
      <div class="inbox">
        <div class="inbox-list">
          ${list.length ? list.map(x => `
            <button type="button" data-open="${x.id}" class="${x.id === openId ? 'active' : ''}">
              <span class="top"><b>${esc(who(x))}</b><time>${dayName(x.daysAgo)}</time></span>
              <span class="preview">${esc(lastText(x))}</span>
              <span><span class="pill ${x.status}">${STATUS[x.status]}</span></span>
            </button>`).join('') : `<p class="empty" style="padding: 14px">Nothing here yet.</p>`}
        </div>
        ${c ? threadHtml(c) : `<div class="thread"><p class="empty" style="padding: 20px">Pick a conversation.</p></div>`}
      </div>
    </section>
  `;
}

function messageLabel(m, c) {
  const base = { auto: 'Auto-text', owner: 'You', customer: who(c) }[m.from] || m.from;
  return m.status === 'failed' || m.status === 'undelivered' ? base + ' · not delivered' : base;
}

function threadHtml(c) {
  return `
    <div class="thread">
      <div class="thread-head">
        <div>
          ${c.name
            ? `<b>${esc(c.name)}</b>`
            : `<form class="name-form" data-name="${c.id}"><label for="name-box" hidden>Customer name</label><input id="name-box" placeholder="Add their name" maxlength="60" autocomplete="off"><button class="btn" type="submit">Save</button></form>`}
          <span class="thread-phone">#${esc(c.id)} · ${esc(c.phone)} · ${dayName(c.daysAgo)} ${esc(c.time)}</span>
        </div>
        <div class="thread-actions">
          ${c.status === 'booked'
            ? `<span class="pill booked">Booked · ${money(c.value)}</span>`
            : `<form class="book-form" data-book="${c.id}">
                 <label for="job-value" hidden>Job value</label>
                 <input id="job-value" inputmode="numeric" placeholder="Job $" aria-label="Job value in dollars">
                 <button class="btn" type="submit">Mark booked</button>
               </form>`}
        </div>
      </div>
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

// ---------- Page: Auto-text settings ----------

// Texts are sent in 160-character pieces (70 if the message has emoji or special symbols).
function textPieces(message) {
  const plain = /^[\x20-\x7E\n\r]*$/.test(message);
  const single = plain ? 160 : 70, multi = plain ? 153 : 67;
  return message.length <= single ? 1 : Math.ceil(message.length / multi);
}

function autotextPage() {
  const a = data.autoText;
  return `
    <header class="page-head">
      <p class="label">Text-Back</p>
      <h1>Auto-text</h1>
      <p class="status-line">This is the text every missed caller gets. Write {business} and it fills in your company name. "Reply STOP to opt out." is added at the end.</p>
    </header>

    <div class="settings">
      <div class="block" style="gap: 28px">
        <div class="field">
          <label for="msg-main">When you're open</label>
          <textarea id="msg-main" maxlength="480">${esc(a.message)}</textarea>
          <div class="meta" id="meta-main"></div>
        </div>

        <div class="field">
          <label class="toggle" for="ah-on"><input type="checkbox" id="ah-on" ${a.afterHoursOn ? 'checked' : ''}>Send a different text when you're closed</label>
          <textarea id="msg-after" maxlength="480" ${a.afterHoursOn ? '' : 'disabled'}>${esc(a.afterHoursMessage)}</textarea>
          <div class="meta" id="meta-after"></div>
        </div>

        <label class="toggle" for="notify-on"><input type="checkbox" id="notify-on" ${a.notifyOwner ? 'checked' : ''}>Text me at ${esc(data.business.ownerPhone)} when a customer replies</label>

        <div class="block" style="gap: 10px">
          <h2>Business hours</h2>
          <p class="note">Outside these hours, callers get the "closed" text. Type times like 7:00 AM.</p>
          <div class="hours-edit">
            ${data.hours.map((h, i) => `
              <div class="hours-row">
                <label class="toggle" for="open-${i}"><input type="checkbox" id="open-${i}" data-day="${i}" ${h.open ? 'checked' : ''}>${h.day}</label>
                <input id="from-${i}" aria-label="${h.day} opens" value="${esc(h.open || '7:00 AM')}" ${h.open ? '' : 'disabled'}>
                <span>to</span>
                <input id="to-${i}" aria-label="${h.day} closes" value="${esc(h.close || '6:00 PM')}" ${h.open ? '' : 'disabled'}>
              </div>`).join('')}
          </div>
        </div>

        <div class="block" style="gap: 10px">
          <h2>Setup</h2>
          <ul class="checks">${data.setup.map(s => `<li class="${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ul>
          <p class="note">Your Ringleader number: <b>${esc(data.business.ringleaderNumber || 'not set up yet')}</b></p>
        </div>

        <div class="save-row">
          <button class="btn btn-main" type="button" id="save">Save changes</button>
        </div>
      </div>

      <aside class="phone-preview">
        <p class="label">What the customer sees</p>
        <div class="phone">
          <p class="from">${esc(data.business.name)}<br>${esc(data.business.ringleaderNumber)}</p>
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
  [['main', mainBox], ['after', afterBox]].forEach(([key, box]) => {
    const text = withOptOut(fill(box.value));
    const pieces = textPieces(text);
    document.getElementById('meta-' + key).innerHTML =
      `<span><b>${text.length}</b> characters as sent</span><span><b>${pieces}</b> text${pieces > 1 ? 's' : ''} per missed call</span>`;
  });
  const source = previewWhich === 'after' && document.getElementById('ah-on').checked ? afterBox : mainBox;
  document.getElementById('preview-bubble').textContent = source.value.trim() ? withOptOut(fill(source.value)) : '…';
}

function readSettingsForm() {
  return {
    message: document.getElementById('msg-main').value,
    afterHoursMessage: document.getElementById('msg-after').value,
    afterHoursOn: document.getElementById('ah-on').checked,
    notifyOwner: document.getElementById('notify-on').checked,
    hours: data.hours.map((h, i) => document.getElementById('open-' + i).checked
      ? { day: h.day, open: document.getElementById('from-' + i).value.trim().toUpperCase().replace(/\s*(AM|PM)$/, ' $1'), close: document.getElementById('to-' + i).value.trim().toUpperCase().replace(/\s*(AM|PM)$/, ' $1') }
      : { day: h.day, open: null, close: null })
  };
}

// ---------- Pages: Front Desk and Crew (not built yet) ----------

function soonPage(plan) {
  const plans = {
    frontdesk: {
      name: 'Front Desk', price: 349,
      intro: 'Everything in Text-Back, plus an AI that answers your calls out loud, day and night.',
      adds: [
        ['Calls answered', 'How many calls the AI picked up, and how long each one took.'],
        ['Emergencies', 'Calls about gas, flooding or sparks, sent straight to your on-call phone.'],
        ['Booked into your calendar', 'Jobs the AI scheduled without you touching the phone.'],
        ['Call summaries', 'A short written summary of every call, so you never have to listen back.']
      ]
    },
    crew: {
      name: 'Crew', price: 599,
      intro: 'Everything in Front Desk, for shops with more than one line or a dispatcher.',
      adds: [
        ['Up to 3 phone lines', 'See results for each line on its own, or all together.'],
        ['English and Spanish', 'Conversations in either language, with a summary in English.'],
        ['Job software sync', 'Booked jobs go straight into the software your shop already uses.'],
        ['Monthly review', 'A call with us each month to tune what the AI says.']
      ]
    }
  };
  const p = plans[plan];
  return `
    <header class="page-head">
      <p class="label">${p.name} · coming soon</p>
      <h1>${p.name}</h1>
      <p class="status-line">${p.intro}</p>
    </header>
    <section class="soon">
      <p class="price">$${p.price}<small> /month</small></p>
      <div class="block" style="gap: 8px">
        <h2>What this section will show</h2>
        <ul>${p.adds.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
      </div>
      <p class="note">We're building Text-Back first. This section turns on when ${p.name} is ready.</p>
    </section>
  `;
}

// ---------- Drawing the right page ----------

const PAGES = {
  overview: overviewPage,
  conversations: conversationsPage,
  autotext: autotextPage,
  frontdesk: () => soonPage('frontdesk'),
  crew: () => soonPage('crew')
};
const currentPage = () => location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'overview';

function render() {
  const page = currentPage();
  main.innerHTML = PAGES[page]();
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.getElementById('biz-name').textContent = data.business.name;
  document.getElementById('waiting-count').textContent = stats().waiting || '';
  document.getElementById('side-foot').textContent =
    mode === 'live' ? 'Live. Texts send from ' + data.business.ringleaderNumber + '.'
      : mode === 'test' ? 'Test mode. No real texts are sent.'
        : 'Example data. Start the server to see real calls.';
  if (page === 'autotext') updateAutotext();
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function refresh() {
  await load();
  render();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// Check for new texts every 15 seconds, unless you're in the middle of typing.
setInterval(() => {
  if (mode === 'example' || document.hidden) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (typing || currentPage() === 'autotext') return;
  const y = window.scrollY;
  refresh().then(() => window.scrollTo(0, y));
}, 15000);

// ---------- Clicks and typing ----------

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
  if (e.target.id === 'msg-main' || e.target.id === 'msg-after') updateAutotext();
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
      toast(r.optedOut ? 'They texted STOP. No more texts will go to this number.' : 'Customer reply received.');
      await refresh();
    } else if (form.dataset.test === 'owner') {
      const r = await api('/api/test/owner-text', { text: document.getElementById('test-owner').value });
      toast(r.sent ? `Your text went to #${r.conversationId}.` : 'Not sent: ' + (r.error || 'nobody to send it to. Check the # number, or simulate a customer reply first.'), !r.sent);
      await refresh();
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
