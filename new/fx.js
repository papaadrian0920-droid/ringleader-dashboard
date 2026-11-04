// Ringleader dashboard extras: the 3D call radar on Today, the sliding menu highlight,
// and cards that light up and lean toward the cursor.
// app.js fires "rl:render" every time it draws a page; everything here hooks into that.
(function () {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tip = document.getElementById('tip');

  // ---------- The call radar ----------
  // Every missed call this week is a point on a tilted radar, one slice per day.
  // Booked jobs stand up as green pillars (taller = bigger job), callers who texted back are white posts,
  // calls with no reply are grey dots on the outer ring. A pulse rings out from the middle, like a phone.
  const canvas = document.createElement('canvas');
  canvas.className = 'radar';
  const ctx = canvas.getContext('2d');
  const PHONE = new Path2D('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2');
  let W = 0, H = 0, dpr = 1, items = [], days = [], grow = 0, rot = 0, tiltX = 0, tiltY = 0, dragging = null, hover = null, running = false, last = 0;

  // Same conversation, same spot, every time (so dots don't jump around on the 15-second refresh)
  const hash = n => { let x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };

  // One slice per day of the week. Over 30 or 60 days, every Monday's calls land in the Monday slice,
  // so you can see which days you miss the most.
  const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const sliceOf = ago => (new Date(Date.now() - ago * 864e5).getDay() + 6) % 7;
  let todaySlice = 0, crowd = 1, shown = [];
  function readData() {
    days = WEEKDAYS;
    todaySlice = sliceOf(0);
    const list = inRange();
    const booked = list.filter(c => c.status === 'booked').sort((a, b) => b.value - a.value);
    const maxValue = Math.max(1, ...booked.map(c => c.value));
    // only the biggest jobs get a price label and a glow, or a busy radar turns to soup
    const labelled = new Set(booked.slice(0, 5).map(c => c.id)), glowing = new Set(booked.slice(0, 12).map(c => c.id));
    crowd = list.length > 60 ? 0.65 : list.length > 25 ? 0.82 : 1;
    items = list.map(c => {
      const kind = c.status === 'booked' ? 'booked' : customerReplied(c) ? 'replied' : 'none';
      const ring = kind === 'booked' ? 0.36 : kind === 'replied' ? 0.66 : 0.92;
      const day = sliceOf(c.daysAgo);
      return {
        c, kind, day,
        ang: (day + 0.12 + hash(c.id) * 0.76) / 7 * Math.PI * 2,
        r: ring + (hash(c.id + 7) - 0.5) * (list.length > 25 ? 0.2 : 0.12),
        h: kind === 'booked' ? 0.16 + 0.54 * (c.value / maxValue) : kind === 'replied' ? 0.11 : 0,
        delay: hash(c.id + 3) * 0.6,
        label: labelled.has(c.id), glow: glowing.has(c.id)
      };
    });
  }
  const when = c => c.daysAgo === 0 ? 'today' : c.daysAgo === 1 ? 'yesterday' : c.daysAgo + ' days ago';

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  // world (x along the floor, y up, z toward you) -> screen, looking down at the floor
  function project(x, y, z, R, cx, cy, elev) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const xr = x * c - z * s, zr = x * s + z * c;
    const ce = Math.cos(elev), se = Math.sin(elev);
    const depth = zr * ce + y * se;
    const k = 1600 / (1600 - depth * R);
    return { x: cx + xr * R * k, y: cy + (-y * ce + zr * se) * R * k, d: depth, k };
  }

  function draw(t) {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // a low camera angle, so the floor reads as a floor and the pillars stand up off it
    const R = Math.min(W * (W < 500 ? 0.39 : 0.46), H * 0.66); // narrower on phones so the day labels fit
    const cx = W / 2, cy = H * 0.6;
    const elev = 0.52 + tiltY * 0.3;
    const P = (x, y, z) => project(x, y, z, R, cx, cy, elev);
    const ring = (r, style, width, dash) => {
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = P(Math.cos(a) * r, 0, Math.sin(a) * r); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    };

    // the floor: a soft disc, rings, and day slices
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = P(Math.cos(a) * 1.04, 0, Math.sin(a) * 1.04); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(200,255,46,.10)'); g.addColorStop(1, 'rgba(200,255,46,.015)');
    ctx.fillStyle = g; ctx.fill();
    ring(1.04, 'rgba(200,255,46,.45)', 1.5);
    ring(0.92, 'rgba(255,255,255,.10)', 1, [3, 5]);
    ring(0.66, 'rgba(255,255,255,.14)', 1, [3, 5]);
    ring(0.36, 'rgba(200,255,46,.28)', 1, [3, 5]);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, p0 = P(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), p1 = P(Math.cos(a) * 1.04, 0, Math.sin(a) * 1.04);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.stroke();
      const la = (i + 0.5) / 7 * Math.PI * 2, lp = P(Math.cos(la) * 1.17, 0, Math.sin(la) * 1.17);
      ctx.font = `600 ${Math.round(11 * lp.k)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = i === todaySlice ? '#C8FF2E' : 'rgba(201,201,194,' + (0.45 + 0.4 * Math.max(0, lp.d)) + ')';
      ctx.fillText((days[i] || '').toUpperCase(), lp.x, lp.y);
    }
    // the sweep: a wedge of light going round
    const sweep = still ? 0 : (t / 3200) % 1 * Math.PI * 2;
    for (let k = 0; k < 14; k++) {
      const a0 = sweep - k * 0.045, a1 = a0 - 0.045;
      const p0 = P(0, 0, 0), pa = P(Math.cos(a0), 0, Math.sin(a0)), pb = P(Math.cos(a1), 0, Math.sin(a1));
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.closePath();
      ctx.fillStyle = `rgba(200,255,46,${0.13 * (1 - k / 14)})`; ctx.fill();
    }
    // ring, ring: pulses out from the middle
    if (!still) for (let k = 0; k < 3; k++) {
      const p = ((t / 2600) + k / 3) % 1;
      ring(0.1 + p * 0.95, `rgba(200,255,46,${0.5 * (1 - p)})`, 2);
    }

    // every call, back to front
    const pts = items.map(it => {
      const x = Math.cos(it.ang) * it.r, z = Math.sin(it.ang) * it.r;
      const gi = Math.min(1, Math.max(0, (grow - it.delay) / 0.6));
      const e = 1 - Math.pow(1 - gi, 3);
      return { it, base: P(x, 0, z), top: P(x, it.h * e, z), e };
    }).sort((a, b) => a.base.d - b.base.d);
    shown = pts;
    hover = null;
    for (const p of pts) {
      const { it, base, top, e } = p;
      if (e <= 0) continue;
      const near = mouse && Math.hypot(mouse.x - top.x, mouse.y - top.y) < 14;
      if (near) hover = p;
      // shadow on the floor
      ctx.beginPath(); ctx.ellipse(base.x, base.y, 7 * base.k, 3 * base.k, 0, 0, Math.PI * 2);
      ctx.fillStyle = it.kind === 'booked' ? 'rgba(200,255,46,.25)' : 'rgba(0,0,0,.35)'; ctx.fill();
      if (it.kind !== 'none') {
        const lg = ctx.createLinearGradient(base.x, base.y, top.x, top.y);
        if (it.kind === 'booked') { lg.addColorStop(0, 'rgba(200,255,46,.15)'); lg.addColorStop(1, 'rgba(200,255,46,.95)'); }
        else { lg.addColorStop(0, 'rgba(244,244,241,.1)'); lg.addColorStop(1, 'rgba(244,244,241,.75)'); }
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y);
        ctx.strokeStyle = lg; ctx.lineWidth = (it.kind === 'booked' ? 6 : 3) * crowd * base.k; ctx.lineCap = 'round'; ctx.stroke();
      }
      const r = (it.kind === 'booked' ? 6.5 : it.kind === 'replied' ? 4.5 : 3.5) * crowd * top.k * (near ? 1.6 : 1) * e;
      if (it.kind === 'booked' && (it.glow || near)) { ctx.shadowColor = 'rgba(200,255,46,.9)'; ctx.shadowBlur = 18; }
      ctx.beginPath(); ctx.arc(top.x, top.y, r, 0, Math.PI * 2);
      ctx.fillStyle = it.kind === 'booked' ? '#C8FF2E' : it.kind === 'replied' ? '#F4F4F1' : '#55555C';
      ctx.fill(); ctx.shadowBlur = 0;
      if (it.kind === 'booked' && (it.label || near) && top.d > -0.2) {
        ctx.font = `800 ${Math.round(12 * top.k)}px Archivo, sans-serif`;
        ctx.fillStyle = 'rgba(244,244,241,.92)'; ctx.textAlign = 'center';
        ctx.fillText(money(it.c.value), top.x, top.y - 14 * top.k);
      }
    }
    // the middle: the Ringleader phone
    const c0 = P(0, 0.02, 0);
    ctx.shadowColor = 'rgba(200,255,46,.8)'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(c0.x, c0.y, 22, 0, Math.PI * 2); ctx.fillStyle = '#C8FF2E'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); ctx.translate(c0.x - 12, c0.y - 12); ctx.strokeStyle = '#0B0B0C'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.rotate(still ? 0 : Math.sin(t / 90) * 0.06 * (((t / 2600) % 1) < 0.25 ? 1 : 0)); ctx.stroke(PHONE); ctx.restore();

    // hover label, reusing the dashboard's own tooltip
    if (hover) {
      const c = hover.it.c, r = canvas.getBoundingClientRect();
      tip.textContent = `${who(c)} · ${hover.it.kind === 'booked' ? 'Booked ' + money(c.value) : hover.it.kind === 'replied' ? 'Texted back' : 'No reply yet'} · ${when(c)} · click to open`;
      tip.style.left = r.left + hover.top.x + 'px'; tip.style.top = r.top + hover.top.y + 'px'; tip.hidden = false;
      canvas.style.cursor = 'pointer';
    } else if (mouse) { tip.hidden = true; canvas.style.cursor = dragging ? 'grabbing' : 'grab'; }
  }

  let mouse = null;
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (dragging) { rot = dragging.rot + (e.clientX - dragging.x) * 0.008; tiltY = Math.max(-1, Math.min(1, dragging.ty + (e.clientY - dragging.y) * 0.006)); }
  });
  canvas.addEventListener('pointerleave', () => { mouse = null; tip.hidden = true; });
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; dragging = { x: e.clientX, y: e.clientY, rot, ty: tiltY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  // Click (or tap) a call to open that person's texts. Works on phones too, where there's no hover.
  canvas.addEventListener('click', e => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // that was a drag, not a tap
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let pick = null, nearest = 20;
    for (const p of shown) { const d = Math.hypot(mx - p.top.x, my - p.top.y); if (d < nearest) { nearest = d; pick = p; } }
    if (!pick) return;
    filter = 'all'; openId = pick.it.c.id; editingName = false; tip.hidden = true;
    location.hash = 'conversations';
  });

  function loop(now) {
    if (!running) return;
    const dt = Math.min(50, now - (last || now)); last = now;
    if (!still && !dragging) rot += dt * 0.00006;
    grow = Math.min(2, grow + dt / 1000);
    draw(now);
    requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } }
  function stop() { running = false; }
  new ResizeObserver(() => { if (canvas.isConnected) size(); }).observe(canvas);
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es[0].isIntersecting && canvas.isConnected ? start() : stop()).observe(canvas);

  // ---------- Sliding highlight under the active menu item ----------
  const nav = document.querySelector('.nav');
  const blob = document.createElement('span');
  blob.className = 'nav-blob';
  nav.prepend(blob);
  function moveBlob() {
    const a = nav.querySelector('a.active');
    if (!a) { blob.style.opacity = 0; return; }
    blob.style.opacity = 1;
    blob.style.width = a.offsetWidth + 'px'; blob.style.height = a.offsetHeight + 'px';
    blob.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
  }
  addEventListener('resize', moveBlob);

  // ---------- Cards: a spotlight follows the cursor; job cards lean toward it ----------
  if (matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', e => {
      const el = e.target.closest && e.target.closest('.card, .job, .tile, .plan');
      if (!el) return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
      if (!still && el.classList.contains('job')) el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg) translateY(-4px)`;
    });
    document.addEventListener('pointerout', e => {
      const el = e.target.closest && e.target.closest('.job');
      if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
    });
  }

  // ---------- Phones: swipe an open chat to the right to go back ----------
  // The chat follows your finger with the list showing underneath, so you can see where you're going.
  // Let go past a third of the way (or flick) and it's gone. Otherwise it slides back, and you can grab it again on the way.
  let swipe = null, settleTimer;
  const chatParts = inbox => inbox.querySelector('.thread');
  function settle(inbox, to, then) {
    inbox.classList.add('settling');
    inbox.style.setProperty('--swipe', to + 'px');
    inbox.style.setProperty('--swipe-p', to ? 1 : 0);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { inbox.classList.remove('settling'); then(); }, 240);
  }
  main.addEventListener('pointerdown', e => {
    const inbox = e.target.closest('.inbox.chat-open');
    // the first bit of the screen edge belongs to the phone's own back swipe
    if (!inbox || e.pointerType !== 'touch' || !isPhone() || e.clientX < 24 || e.target.closest('.quick, input, textarea, a')) return;
    swipe = { inbox, id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp, from: 0, dragging: false };
  });
  addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } // that's a scroll
      if (dx < 10 || dx < Math.abs(dy) * 1.5) return;
      if (!swipe.inbox.isConnected) { swipe = null; return; }
      clearTimeout(settleTimer);
      swipe.from = new DOMMatrix(getComputedStyle(chatParts(swipe.inbox)).transform).m41; // grabbed mid-slide: carry on from there
      swipe.inbox.classList.remove('settling');
      swipe.inbox.classList.add('swiping');
      swipe.dragging = true;
    }
    const moved = Math.max(0, swipe.from + dx);
    swipe.inbox.style.setProperty('--swipe', moved + 'px');
    swipe.inbox.style.setProperty('--swipe-p', Math.min(1, moved / innerWidth));
  });
  function endSwipe(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const { inbox, dragging, x, at, from } = swipe;
    swipe = null;
    if (!dragging) return;
    const dx = from + e.clientX - x, flick = (e.clientX - x) / Math.max(1, e.timeStamp - at) > 0.5 && dx > 40;
    if (e.type === 'pointerup' && (dx > innerWidth / 3 || flick)) settle(inbox, innerWidth, () => closeChat({ slid: true }));
    else settle(inbox, 0, () => inbox.classList.remove('swiping'));
  }
  addEventListener('pointerup', endSwipe);
  addEventListener('pointercancel', endSwipe);

  // ---------- after every page draw ----------
  addEventListener('rl:render', e => {
    moveBlob();
    const slot = document.querySelector('.radar-slot');
    if (slot) {
      readData();
      if (e.detail.animate) grow = 0;
      slot.appendChild(canvas);
      size();
      start();
    } else { stop(); tip.hidden = true; }
  });
})();
