// Ringleader dashboard
// Reads the data from data.js and draws one page at a time.
// The page shown depends on the end of the address: #overview, #conversations, #autotext, #frontdesk, #crew.

const data = window.RL_DATA;
const main = document.getElementById('main');

// ---------- Small helpers ----------

const money = n => '$' + Math.round(n).toLocaleString('en-US');

// Makes text safe to put inside HTML (so a customer's message can't break the page).
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Puts the business name into a message template.
const fill = template => template.replace(/\{business\}/g, data.business.name);

// The auto-text is the first message in every conversation.
data.conversations.forEach(c => {
  if (c.messages[0] && c.messages[0].from === 'auto' && !c.messages[0].text) c.messages[0].text = fill(data.autoText.message);
});

const STATUS = {
  waiting: 'Waiting on you',
  replied: 'You replied',
  booked: 'Booked',
  'no-reply': 'No reply yet'
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
const lastText = c => c.messages[c.messages.length - 1].text;
const customerReplied = c => c.messages.some(m => m.from === 'customer');

// ---------- Numbers (all worked out from the conversations, so they always add up) ----------

function stats() {
  const all = data.conversations;
  const booked = all.filter(c => c.status === 'booked');
  return {
    missed: all.length,
    texted: all.filter(c => c.messages.some(m => m.from === 'auto')).length,
    replied: all.filter(customerReplied).length,
    booked: booked.length,
    money: booked.reduce((sum, c) => sum + c.value, 0),
    waiting: all.filter(c => c.status === 'waiting').length
  };
}

const pct = (part, whole) => whole ? Math.round((part / whole) * 100) + '%' : '0%';

// ---------- Page: Overview ----------

function overviewPage() {
  const s = stats();
  const waiting = data.conversations.filter(c => c.status === 'waiting');
  const recent = data.conversations.filter(c => c.status !== 'waiting').slice(0, 6);

  return `
    <header class="page-head">
      <p class="label">Text-Back · last 7 days</p>
      <h1>Good morning, ${esc(data.business.owner)}.</h1>
      <p class="status-line"><span class="dot"></span>Text-Back is on. Calls you miss on ${esc(data.business.ownerPhone)} get a text in about 5 seconds.</p>
    </header>

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
      <div class="rows">${recent.map(rowHtml).join('')}</div>
    </section>
  `;
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
  const max = Math.max(4, ...days.map(d => d.total));
  const step = (W - L) / days.length;
  const bw = step * 0.5;
  const y = v => T + (H - T - B) * (1 - v / max);
  let svg = '';
  for (let v = 0; v <= max; v += 2) {
    svg += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`;
    svg += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--faint)" font-family="IBM Plex Mono, monospace">${v}</text>`;
  }
  days.forEach((d, i) => {
    const x = L + i * step + (step - bw) / 2;
    svg += `<rect x="${x}" y="${y(d.total)}" width="${bw}" height="${y(0) - y(d.total)}" rx="3" fill="var(--bar)"><title>${d.label}: ${d.total} missed</title></rect>`;
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
      <p class="status-line">Every missed call starts a text conversation. Reply here and it texts the customer from ${esc(data.business.ringleaderNumber)}.</p>
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
            </button>`).join('') : `<p class="empty" style="padding: 14px">Nothing here.</p>`}
        </div>
        ${c ? threadHtml(c) : `<div class="thread"><p class="empty" style="padding: 20px">Pick a conversation.</p></div>`}
      </div>
    </section>
  `;
}

function threadHtml(c) {
  const labels = { auto: 'Auto-text', owner: 'You', customer: who(c) };
  return `
    <div class="thread">
      <div class="thread-head">
        <div><b>${esc(who(c))}</b><span class="thread-phone">${esc(c.phone)} · ${dayName(c.daysAgo)} ${esc(c.time)}</span></div>
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
        ${c.messages.map(m => `<div class="msg ${m.from}"><p>${esc(m.text)}</p><small>${esc(labels[m.from])}</small></div>`).join('')}
      </div>
      <form class="composer" data-reply="${c.id}">
        <label for="reply-box" hidden>Reply</label>
        <input id="reply-box" placeholder="Text ${esc(who(c))}…" maxlength="320" autocomplete="off">
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
      <p class="status-line">This is the text every missed caller gets. Write {business} and it fills in your company name.</p>
    </header>

    <div class="settings">
      <div class="block" style="gap: 28px">
        <div class="field">
          <label for="msg-main">During business hours</label>
          <textarea id="msg-main">${esc(a.message)}</textarea>
          <div class="meta" id="meta-main"></div>
        </div>

        <div class="field">
          <label class="toggle" for="ah-on"><input type="checkbox" id="ah-on" ${a.afterHoursOn ? 'checked' : ''}>Send a different text when you're closed</label>
          <textarea id="msg-after" ${a.afterHoursOn ? '' : 'disabled'}>${esc(a.afterHoursMessage)}</textarea>
          <div class="meta" id="meta-after"></div>
        </div>

        <label class="toggle" for="notify-on"><input type="checkbox" id="notify-on" ${a.notifyOwner ? 'checked' : ''}>Text me at ${esc(data.business.ownerPhone)} when a customer replies</label>

        <div class="block" style="gap: 10px">
          <h2>Business hours</h2>
          <dl class="hours">
            ${data.hours.map(h => `<dt>${h.day}</dt><dd>${h.open ? `${h.open} – ${h.close}` : 'Closed'}</dd>`).join('')}
          </dl>
        </div>

        <div class="block" style="gap: 10px">
          <h2>Setup</h2>
          <ul class="checks">${data.setup.map(s => `<li class="${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ul>
          <p class="note">Your Ringleader number: <b>${esc(data.business.ringleaderNumber)}</b></p>
        </div>

        <div class="save-row">
          <button class="btn btn-main" type="button" id="save">Save changes</button>
          <span class="note" id="save-msg" aria-live="polite"></span>
        </div>
      </div>

      <aside class="phone-preview">
        <p class="label">What the customer sees</p>
        <div class="phone">
          <p class="from">${esc(data.business.name)}<br>${esc(data.business.ringleaderNumber)}</p>
          <div class="bubble" id="preview-bubble"></div>
        </div>
        <div class="tabs" role="group" aria-label="Preview which text">
          <button type="button" data-preview="main" aria-pressed="true">Open</button>
          <button type="button" data-preview="after" aria-pressed="false">Closed</button>
        </div>
      </aside>
    </div>
  `;
}

let previewWhich = 'main';
function updateAutotext() {
  const main = document.getElementById('msg-main');
  const after = document.getElementById('msg-after');
  [['main', main], ['after', after]].forEach(([key, box]) => {
    const text = fill(box.value);
    const pieces = textPieces(text);
    document.getElementById('meta-' + key).innerHTML =
      `<span><b>${text.length}</b> characters with your name filled in</span><span><b>${pieces}</b> text${pieces > 1 ? 's' : ''} per missed call</span>`;
  });
  const source = previewWhich === 'after' && document.getElementById('ah-on').checked ? after : main;
  document.getElementById('preview-bubble').textContent = fill(source.value) || '…';
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

function render() {
  const page = location.hash.slice(1) in PAGES ? location.hash.slice(1) : 'overview';
  main.innerHTML = PAGES[page]();
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.getElementById('biz-name').textContent = data.business.name;
  document.getElementById('waiting-count').textContent = stats().waiting || '';
  if (page === 'autotext') updateAutotext();
  const msgs = document.getElementById('msgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- Clicks and typing ----------

main.addEventListener('click', e => {
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
    // For now this only changes the page. Once the server exists, this sends the settings to it.
    data.autoText.message = document.getElementById('msg-main').value;
    data.autoText.afterHoursMessage = document.getElementById('msg-after').value;
    data.autoText.afterHoursOn = document.getElementById('ah-on').checked;
    data.autoText.notifyOwner = document.getElementById('notify-on').checked;
    document.getElementById('save-msg').textContent = 'Saved on this page. Real saving comes when we build the server.';
  }
});

main.addEventListener('input', e => {
  if (e.target.id === 'msg-main' || e.target.id === 'msg-after') updateAutotext();
  if (e.target.id === 'ah-on') {
    document.getElementById('msg-after').disabled = !e.target.checked;
    updateAutotext();
  }
});

main.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.reply) {
    const box = form.querySelector('input');
    const text = box.value.trim();
    if (!text) return;
    const c = data.conversations.find(x => x.id === Number(form.dataset.reply));
    c.messages.push({ from: 'owner', text });
    if (c.status === 'waiting' || c.status === 'no-reply') c.status = 'replied';
    render();
    document.getElementById('reply-box').focus();
  }
  if (form.dataset.book) {
    const raw = form.querySelector('input').value.replace(/[^0-9.]/g, '');
    const c = data.conversations.find(x => x.id === Number(form.dataset.book));
    c.status = 'booked';
    c.value = Number(raw) || 0;
    render();
  }
});

render();
