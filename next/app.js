/* Bangalore Hide + Seek, redesign core.
   Owns state, timing, rules, alerts, the title screen and the navigation shell.
   Screens live in screens/*.js and register themselves with BHS.registerScreen.

   Contract for screens:
     BHS.registerScreen({
       id: 'seeker',            // unique
       role: 'seeker',          // 'seeker', 'hider' or 'both'
       tab: 'Board',            // label in the bottom nav
       order: 10,               // nav order
       mount: function (el) {}, // called once with the screen's container element
       render: function (d, now) {} // called every second while the screen is visible
     });
   Screens read BHS.state and call BHS.actions.* to change it. They never write state directly.
   BHS.render() forces a re-render. Timing constants respect test mode (BHS.MIN). */

(function () {
  'use strict';
  var TEST = /[?&]test=1/.test(location.search);
  var KEY = TEST ? 'bhs-state-v2-test' : 'bhs-state-v2';
  var MIN = TEST ? 1000 : 60000;
  var HARD_STOP_MS = 5 * 60 * MIN;
  var ENDGAME_MS = 3 * 60 * MIN;
  var BLACKOUT_MS = 20 * MIN;
  var HOTCOLD_GAP_MS = 10 * MIN;
  var ANSWER_MS = 5 * MIN;
  var WARN_MS = 15 * MIN;
  var MAX_HINTS = 6;

  var CHALLENGES = [
    { title: 'Signs', short: 'Three scripts on one street', text: 'Photograph three signboards on one street in three different scripts (Kannada, English and any third).' },
    { title: 'Food', short: 'Most popular item, new darshini', text: 'In a cafe or darshini you have never visited, ask what their most popular item is. Photo of the item or menu board.' },
    { title: 'Street buy', short: 'Under Rs 50 from a pushcart', text: 'Buy something under Rs 50 from a street vendor or pushcart. Photo of it in hand.' },
    { title: 'Never noticed', short: 'Statue, gopuram or old building', text: 'Photo with a statue, temple gopuram or old building you have never paid attention to before.' },
    { title: 'Choice', short: 'Book stall, auto slogan or Kannada', text: 'Pick one. (a) Book cover from a footpath book stall. (b) Auto with a slogan painted on the back. (c) A local writes the neighbourhood name in Kannada on paper.' },
    { title: 'Metro', short: 'Platform with station name', text: 'Photo from inside any metro station on the platform with the station name visible.' }
  ];
  var HINTS = [
    { id: 'A', cat: 'Measuring', q: 'Closer to Richmond Circle or to Jayanagar 4th Block bus stand?', d: 'Straight-line distance. Hider answers with the name.' },
    { id: 'B', cat: 'Measuring', q: 'Closer to MG Road metro station or to Sony World signal, Koramangala?', d: 'Straight-line distance. Hider answers with the name.' },
    { id: 'C', cat: 'Matching', q: 'Within 500 m of a metro station?', d: 'Yes or no.' },
    { id: 'D', cat: 'Matching', q: 'Which metro station is nearest to you?', d: 'By name. Straight-line distance, any line.' },
    { id: 'E', cat: 'Photo', q: 'Photo looking down the road from where you stand', d: 'One direction, road included, unedited.' },
    { id: 'F', cat: 'Photo', q: 'Photo of the nearest readable shop sign or building name', d: 'Unedited, must show the street.' },
    { id: 'G', cat: 'Matching', q: 'Which neighbourhood from the play-area list are you in?', d: 'One name from the list.' },
    { id: 'H', cat: 'Measuring', q: 'Distance from Richmond Circle as a band', d: 'Under 2 km, 2 to 4 km, or over 4 km.' }
  ];
  var CATEGORIES = ['Matching', 'Measuring', 'Photo'];

  function fresh() {
    return {
      role: null, headStart: 40, hiderLeftAt: null, relocateAt: null, zones: [],
      challenges: [false, false, false, false, false, false],
      hints: {},      // id -> timestamp asked
      answers: {},    // id -> { t: timestamp, text: string }
      hotCold: [],    // [{ t: timestamp asked, a: null | 'yes' | 'no' }]
      ended: null,    // null | 'seeker' | 'hider'
      fired: {}, wa: true, log: []
    };
  }

  // Dev aid, test mode only: ?test=1&seed=<urlencoded JSON> replaces the test state before loading.
  if (TEST) {
    var seedMatch = /[?&]seed=([^&]+)/.exec(location.search);
    if (seedMatch) { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(fresh(), JSON.parse(decodeURIComponent(seedMatch[1]))))); } catch (e) {} }
  }
  var state = load();
  var titleOverride = false;
  var audioCtx = null;
  var screens = [];
  var activeId = null;

  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return Object.assign(fresh(), JSON.parse(raw)); } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function log(msg) { state.log.unshift({ t: Date.now(), m: msg }); save(); }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ts) { var x = new Date(ts); return pad(x.getHours()) + ':' + pad(x.getMinutes()) + (TEST ? ':' + pad(x.getSeconds()) : ''); }
  function clockS(ts) { var x = new Date(ts); return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds()); }
  function countdownParts(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h > 0 ? { main: h + ':' + pad(m), small: ':' + pad(r) } : { main: pad(m), small: ':' + pad(r) };
  }
  function countdown(ms) { var p = countdownParts(ms); return p.main + '<small>' + p.small + '</small>'; }
  function countdownText(ms) { var p = countdownParts(ms); return p.main + p.small; }
  function toChat(text) {
    if (!state.wa) return;
    try { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); } catch (e) {}
  }
  function hint(id) { for (var i = 0; i < HINTS.length; i++) if (HINTS[i].id === id) return HINTS[i]; return null; }

  function derived(now) {
    var d = {};
    d.seekerStartAt = state.hiderLeftAt ? state.hiderLeftAt + state.headStart * MIN : null;
    d.hardStopAt = d.seekerStartAt ? d.seekerStartAt + HARD_STOP_MS : null;
    d.endgameAt = d.seekerStartAt ? d.seekerStartAt + ENDGAME_MS : null;
    d.hintsUsed = Object.keys(state.hints).length;
    d.blackoutUntil = state.relocateAt ? state.relocateAt + BLACKOUT_MS : null;
    d.inBlackout = d.blackoutUntil !== null && now < d.blackoutUntil;
    d.challengesDone = state.challenges.filter(Boolean).length;
    d.hintsEarned = d.challengesDone - d.hintsUsed;
    d.nextChallenge = state.challenges.indexOf(false);
    d.lastDone = d.nextChallenge === -1 ? CHALLENGES.length - 1 : d.nextChallenge - 1;
    if (state.ended) d.phase = 'ended';
    else if (!state.hiderLeftAt) d.phase = 'setup';
    else if (now < d.seekerStartAt) d.phase = 'headstart';
    else if (now >= d.hardStopAt) d.phase = 'timeout';
    else d.phase = 'play';
    d.endgameOpen = d.phase === 'play' && (d.hintsUsed >= MAX_HINTS || now >= d.endgameAt);
    var last = state.hotCold.length ? state.hotCold[state.hotCold.length - 1] : null;
    d.hotColdNextAt = last ? last.t + HOTCOLD_GAP_MS : null;
    d.hotColdReady = d.endgameOpen && (!d.hotColdNextAt || now >= d.hotColdNextAt);
    d.hotColdPending = last && !last.a ? last : null;
    d.zoneOpen = d.phase === 'play' && state.zones.length <= (state.relocateAt ? 1 : 0);
    d.relocateOpen = d.phase === 'play' && !state.relocateAt && !d.endgameOpen;
    d.canAskHint = d.phase === 'play' && !d.inBlackout && d.hintsEarned > 0 && d.hintsUsed < MAX_HINTS;
    // The most recent hint asked and not yet answered, with its answer deadline.
    d.openHint = null;
    var openId = null, openT = 0;
    Object.keys(state.hints).forEach(function (id) { if (!state.answers[id] && state.hints[id] > openT) { openT = state.hints[id]; openId = id; } });
    if (openId) d.openHint = { id: openId, t: openT, dueAt: openT + ANSWER_MS, hint: hint(openId) };
    d.winner = state.ended === 'seeker' ? 'seeker' : (state.ended === 'hider' || d.phase === 'timeout') ? 'hider' : null;
    d.phaseText = { setup: 'Setup', headstart: 'Head start', play: d.inBlackout ? 'Blackout' : (d.endgameOpen ? 'Endgame' : 'Seeking'), timeout: 'Time is up', ended: state.ended === 'seeker' ? 'Found' : 'Conceded' }[d.phase];
    return d;
  }
  function canToggleChallenge(i, d) {
    if (d.phase !== 'play') return false;
    if (!state.challenges[i]) return i === d.nextChallenge;
    return i === d.lastDone && d.hintsUsed < d.challengesDone;
  }

  /* Shared hero markup so every screen shows time the same way. */
  function heroHTML(d, now) {
    var label, big, note = '';
    if (d.phase === 'headstart') { label = 'Seeker starts in'; big = countdown(d.seekerStartAt - now); note = 'Hider moves freely. Seeker waits at Adugodi.'; }
    else if (d.phase === 'play' && d.inBlackout) { label = 'Blackout ends in'; big = countdown(d.blackoutUntil - now); note = 'Relocate in progress. No hints until ' + clock(d.blackoutUntil) + '.'; }
    else if (d.phase === 'play') { label = 'Hard stop in'; big = countdown(d.hardStopAt - now); note = d.endgameOpen ? 'Endgame open. Within 500 m ask every 10 minutes.' : 'Endgame opens at ' + clock(d.endgameAt) + ' or after six hints.'; }
    else if (d.phase === 'timeout') { label = 'Hard stop passed'; big = 'Hider wins'; note = 'Time ran out at ' + clock(d.hardStopAt) + '.'; }
    else { label = 'Game over'; big = state.ended === 'seeker' ? 'Seeker wins' : 'Hider wins'; note = state.ended === 'seeker' ? 'Found. Photo is in the chat.' : 'Seeker conceded.'; }
    var bigClass = (d.phase === 'ended' || d.phase === 'timeout') ? 'big words' : 'big';
    return '<div class="hero"><div class="label">' + label + '</div><div class="' + bigClass + '">' + big + '</div>' +
      '<div class="pill-row" style="margin-top:10px">' +
      '<div class="pill"><b>Phase</b>' + d.phaseText + '</div>' +
      '<div class="pill"><b>Hard stop</b>' + (d.hardStopAt ? clock(d.hardStopAt) : '--:--') + '</div>' +
      '<div class="pill' + (d.hintsEarned > 0 && d.phase === 'play' ? ' hot' : '') + '"><b>Hints</b>' + d.hintsUsed + ' of ' + MAX_HINTS + (d.hintsEarned > 0 && d.phase === 'play' ? ', ' + d.hintsEarned + ' to spend' : '') + '</div>' +
      '</div>' + (note ? '<div class="note" style="margin-top:10px">' + note + '</div>' : '') + '</div>';
  }

  /* Alerts */
  function beep() {
    try {
      if (!audioCtx) return;
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.2;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.6);
    } catch (e) {}
  }
  function alertUser(key, title, body) {
    if (state.fired[key]) return;
    state.fired[key] = Date.now(); save();
    log('Alert: ' + title);
    beep();
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body }); } catch (e) {}
  }
  function checkAlerts(now, d) {
    if (d.phase === 'setup' || d.phase === 'ended') return;
    if (now >= d.seekerStartAt) alertUser('seekerStart', 'Seeker starts now', 'Hider: commit your zone and press Zone committed.');
    if (d.blackoutUntil && now >= d.blackoutUntil) alertUser('blackoutEnd', 'Blackout over', 'Hints can be requested again.');
    if (d.phase === 'play' && d.endgameOpen) alertUser('endgame', 'Endgame open', 'Seeker may ask within 500 m every 10 minutes.');
    if (now >= d.hardStopAt - WARN_MS && now < d.hardStopAt) alertUser('warn15', '15 minutes to hard stop', 'Hard stop at ' + clock(d.hardStopAt) + '.');
    if (now >= d.hardStopAt) alertUser('hardStop', 'Hard stop', 'Time is up. Hider wins.');
  }
  function alertsStatus() {
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    if (!audioCtx) return { on: false, text: 'Tap once so the phone allows sound.' };
    if (perm === 'granted') return { on: true, text: 'Sound, vibration and notifications on.' };
    return { on: true, text: 'Sound and vibration on. Notifications ' + (perm === 'unsupported' ? 'not supported here.' : 'not allowed.') };
  }

  /* Actions. Every state change goes through here so the log and the chat stay consistent. */
  var actions = {
    setRole: function (role) {
      state.role = role; save();
      applyRole(); render();
    },
    setHeadStart: function (m) { state.headStart = m; save(); render(); },
    setWhatsApp: function (on) { state.wa = !!on; save(); },
    enableAlerts: function () {
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); beep(); } catch (e) {}
      try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(render); } catch (e) {}
      render();
    },
    leave: function (manualHHMM) {
      var t = Date.now();
      if (manualHHMM && !TEST) {
        var p = manualHHMM.split(':'); var x = new Date(); x.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0); t = x.getTime();
        if (t > Date.now()) { alert('That time is in the future. Use the time the Hider actually left.'); return false; }
      }
      if (!confirm('Start the clock with a ' + state.headStart + (TEST ? ' second' : ' minute') + ' head start' + (manualHHMM && !TEST ? ' from ' + manualHHMM : ' from now') + '?')) return false;
      state.hiderLeftAt = t; titleOverride = false;
      var ss = t + state.headStart * MIN;
      log('Hider left at ' + clock(t) + '. Head start ' + state.headStart + '. Seeker starts at ' + clock(ss) + '.');
      toChat('Hider leaving at ' + clock(t) + '. Head start ' + state.headStart + ' min. Seeker starts at ' + clock(ss) + '. Hard stop ' + clock(ss + HARD_STOP_MS) + '.');
      render(); return true;
    },
    toggleChallenge: function (i) {
      var d = derived(Date.now());
      if (!canToggleChallenge(i, d)) return false;
      var checked = !state.challenges[i];
      if (checked && !confirm('Challenge ' + (i + 1) + ' done? Proof photo goes to the chat.')) return false;
      state.challenges[i] = checked;
      log((checked ? 'Challenge ' : 'Unchecked challenge ') + (i + 1) + (checked ? ': ' + CHALLENGES[i].title : ''));
      if (checked) toChat('Challenge ' + (i + 1) + ' done at ' + clock(Date.now()) + '. Proof photo follows. One hint earned.');
      render(); return true;
    },
    askHint: function (id) {
      var d = derived(Date.now()); var h = hint(id);
      if (!h || state.hints[id] || !d.canAskHint) return false;
      if (!confirm('Ask hint ' + id + '? It will be marked used.')) return false;
      var t = Date.now();
      state.hints[id] = t;
      log('Hint ' + id + ' asked: ' + h.q);
      toChat('HINT ' + id + ' requested at ' + clock(t) + ': ' + h.q + ' (answer within 5 minutes)');
      render(); return true;
    },
    answerHint: function (id, text) {
      if (!state.hints[id] || !text) return false;
      state.answers[id] = { t: Date.now(), text: String(text).trim() };
      log('Hint ' + id + ' answered: ' + state.answers[id].text);
      render(); return true;
    },
    commitZone: function () {
      var d = derived(Date.now());
      if (!d.zoneOpen) return false;
      if (!confirm('Zone committed? Take the pin screenshot first.')) return false;
      var t = Date.now();
      state.zones.push(t);
      log('Zone committed');
      toChat('Zone committed at ' + clock(t) + '. Pin screenshot taken.');
      render(); return true;
    },
    relocate: function () {
      var d = derived(Date.now());
      if (!d.relocateOpen) return false;
      if (!confirm('Use Relocate now? Blackout for 20 minutes, then commit a new zone.')) return false;
      var t = Date.now();
      state.relocateAt = t;
      log('Relocate used. Blackout until ' + clock(t + BLACKOUT_MS) + '.');
      toChat('RELOCATING at ' + clock(t) + '. No hints until ' + clock(t + BLACKOUT_MS) + '.');
      render(); return true;
    },
    hotColdAsk: function () {
      var d = derived(Date.now());
      if (!d.hotColdReady) return false;
      var t = Date.now();
      state.hotCold.push({ t: t, a: null });
      log('Within 500 m? asked');
      toChat('Within 500 m of you? Asked at ' + clock(t) + '. My location pin follows. Measure straight-line distance to the pin, answer yes or no.');
      render(); return true;
    },
    hotColdAnswer: function (answer) {
      var last = state.hotCold.length ? state.hotCold[state.hotCold.length - 1] : null;
      if (!last || last.a || (answer !== 'yes' && answer !== 'no')) return false;
      last.a = answer;
      log('Within 500 m? answered ' + answer.toUpperCase());
      render(); return true;
    },
    found: function () {
      var d = derived(Date.now());
      if (d.phase !== 'play') return false;
      if (!confirm('Seeker found the Hider? Photo must be in the chat.')) return false;
      state.ended = 'seeker'; log('Seeker found the Hider. Seeker wins.'); render(); return true;
    },
    concede: function () {
      var d = derived(Date.now());
      if (d.phase !== 'play') return false;
      if (!confirm('Seeker concedes. Hider wins. Confirm?')) return false;
      state.ended = 'hider'; log('Seeker conceded. Hider wins.'); render(); return true;
    },
    logText: function () {
      return state.log.slice().reverse().map(function (e) { return clockS(e.t) + ' ' + e.m; }).join('\n');
    },
    copyLog: function () {
      var text = actions.logText();
      if (!text) { alert('Nothing recorded yet.'); return; }
      function fallback() { window.prompt('Copy the record:', text); }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { alert('Record copied.'); }, fallback);
        else fallback();
      } catch (e) { fallback(); }
    },
    reset: function () {
      if (!confirm('Reset the whole game on this phone? This cannot be undone.')) return false;
      var role = state.role; state = fresh(); state.role = role; save(); titleOverride = false;
      BHS.state = state; render(); return true;
    },
    showTitle: function () { titleOverride = true; render(); },
    showScreen: function (id) { activeId = id; render(); }
  };

  /* Screens and navigation */
  function registerScreen(s) {
    screens.push(s);
    screens.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var el = document.createElement('section');
    el.className = 'screen'; el.id = 'screen-' + s.id; el.hidden = true;
    $('screens').appendChild(el);
    s.el = el;
    if (s.mount) s.mount(el);
    render();
  }
  function visibleScreens() {
    return screens.filter(function (s) { return s.role === 'both' || s.role === state.role; });
  }
  function buildNav(list) {
    var nav = $('nav'); nav.innerHTML = '';
    list.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.id = s.id; b.textContent = s.tab || s.id;
      b.className = s.id === activeId ? 'on' : '';
      b.addEventListener('click', function () { actions.showScreen(s.id); });
      nav.appendChild(b);
    });
    nav.hidden = list.length < 2;
  }

  function applyRole() {
    var role = state.role;
    document.body.classList.toggle('hider', role === 'hider');
    var wedge = role === 'hider' ? '#453366' : '#202937';
    Array.prototype.forEach.call(document.querySelectorAll('.wedge'), function (el) { el.setAttribute('fill', wedge); });
    Array.prototype.forEach.call(document.querySelectorAll('#roles button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.role === role)); });
    $('roleChip').textContent = role === 'hider' ? 'Hider' : 'Seeker';
  }

  function renderTitle(d) {
    Array.prototype.forEach.call($('headStart').children, function (b) { b.setAttribute('aria-pressed', String(parseInt(b.dataset.min, 10) === state.headStart)); });
    var running = d.phase !== 'setup';
    $('btnLeave').disabled = running;
    $('btnLeave').textContent = running ? 'Clock is running' : 'Hider leaves now';
    $('btnBackToBoard').hidden = !running;
    $('leftAt').disabled = running;
    $('waToggle').checked = !!state.wa;
    var a = alertsStatus();
    $('alertNote').textContent = a.text;
    $('btnAlerts').textContent = a.on ? 'Alerts on' : 'Enable alerts';
  }

  function render() {
    var now = Date.now();
    var d = derived(now);
    checkAlerts(now, d);
    var onBoard = d.phase !== 'setup' && !titleOverride && !!state.role;
    $('screenTitle').hidden = onBoard;
    $('shell').hidden = !onBoard;
    if (!onBoard) { renderTitle(d); return; }

    var list = visibleScreens();
    if (!list.length) { $('screens').innerHTML = ''; return; }
    if (!list.some(function (s) { return s.id === activeId; })) activeId = list[0].id;
    buildNav(list);
    screens.forEach(function (s) {
      var show = s.id === activeId;
      if (s.el.hidden === show) s.el.hidden = !show;
      if (show && s.render) s.render(d, now);
    });
    var a = alertsStatus();
    $('alertChip').hidden = a.on;
  }

  /* Title screen wiring */
  var seg = $('headStart');
  for (var m = 30; m <= 45; m += 5) {
    var b = document.createElement('button'); b.type = 'button'; b.dataset.min = m;
    b.textContent = m + (TEST ? ' s' : ' min');
    b.addEventListener('click', function () { actions.setHeadStart(parseInt(this.dataset.min, 10)); });
    seg.appendChild(b);
  }
  Array.prototype.forEach.call(document.querySelectorAll('#roles button'), function (b) {
    b.addEventListener('click', function () { actions.setRole(this.dataset.role); });
  });
  $('waToggle').addEventListener('change', function () { actions.setWhatsApp($('waToggle').checked); });
  $('btnAlerts').addEventListener('click', actions.enableAlerts);
  $('alertChip').addEventListener('click', actions.enableAlerts);
  $('btnLeave').addEventListener('click', function () {
    if (!state.role) { alert('Pick Hider or Seeker first.'); return; }
    actions.leave($('leftAt').value);
  });
  $('btnBackToBoard').addEventListener('click', function () { titleOverride = false; render(); });
  $('btnTitle').addEventListener('click', actions.showTitle);
  if (TEST) $('testBanner').hidden = false;

  window.BHS = {
    TEST: TEST, MIN: MIN, HARD_STOP_MS: HARD_STOP_MS, ENDGAME_MS: ENDGAME_MS, BLACKOUT_MS: BLACKOUT_MS,
    HOTCOLD_GAP_MS: HOTCOLD_GAP_MS, ANSWER_MS: ANSWER_MS, MAX_HINTS: MAX_HINTS,
    CHALLENGES: CHALLENGES, HINTS: HINTS, CATEGORIES: CATEGORIES,
    state: state, actions: actions, derived: derived, canToggleChallenge: canToggleChallenge,
    hint: hint, heroHTML: heroHTML, clock: clock, clockS: clockS, countdown: countdown, countdownText: countdownText,
    $: $, render: render, registerScreen: registerScreen, alertsStatus: alertsStatus
  };
  // Keep BHS.state pointing at the live object after a reset.
  Object.defineProperty(window.BHS, 'state', { get: function () { return state; }, set: function (v) { state = v; } });

  applyRole();
  render();
  setInterval(render, 1000);
})();
