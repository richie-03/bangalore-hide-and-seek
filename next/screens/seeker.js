/* Bangalore Hide + Seek, Seeker board screen.
   Hero, challenge route, investigation book (hint cards), hint reveal overlay and the finish buttons.
   Nodes are built once in mount; render updates text, classes and disabled state every second. */

(function () {
  'use strict';

  var CAT_KEY = { Matching: 'match', Measuring: 'meas', Photo: 'photo' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function btn(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function setClass(node, cls) { if (node.className !== cls) node.className = cls; }
  function setHidden(node, hide) { if (node.hidden !== !!hide) node.hidden = !!hide; }
  function setDisabled(node, dis) { if (node.disabled !== !!dis) node.disabled = !!dis; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  var ui = {};
  var stops = [];
  var cards = [];
  var tabs = [];
  var filter = 'All';
  var heroCache = '';
  var listSig = '';
  var dismissedFor = null;   // hint id whose overlay the Seeker closed with Later
  var revealFor = null;      // hint id currently drawn in the overlay

  function mount(root) {
    var BHS = window.BHS;

    /* Endgame alert */
    ui.endgameAlert = el('div', 'alert teal');
    ui.endgameAlert.hidden = true;
    var eaText = el('span');
    eaText.appendChild(el('span', 'k', 'Endgame open'));
    eaText.appendChild(document.createTextNode('Radar asks are on the Radar tab.'));
    ui.endgameAlert.appendChild(eaText);
    var eaBtn = btn('alert-btn', 'Radar');
    eaBtn.addEventListener('click', function () { BHS.actions.showScreen('endgame'); });
    ui.endgameAlert.appendChild(eaBtn);
    root.appendChild(ui.endgameAlert);

    /* Open hint strip, shown when the reveal overlay was dismissed with Later */
    ui.openAlert = el('div', 'alert');
    ui.openAlert.hidden = true;
    var oaText = el('span');
    ui.openAlertK = el('span', 'k', 'Hint asked');
    oaText.appendChild(ui.openAlertK);
    oaText.appendChild(document.createTextNode('Waiting for the Hider.'));
    ui.openAlert.appendChild(oaText);
    ui.openAlertCd = el('span', 'cd', '00:00');
    ui.openAlert.appendChild(ui.openAlertCd);
    var oaBtn = btn('alert-btn', 'Record');
    oaBtn.addEventListener('click', function () { dismissedFor = null; BHS.render(); });
    ui.openAlert.appendChild(oaBtn);
    root.appendChild(ui.openAlert);

    /* Hero */
    ui.hero = el('div', 'hero-wrap');
    root.appendChild(ui.hero);

    /* Challenges */
    var secC = el('div', 'sec');
    var hC = el('h2');
    hC.appendChild(document.createTextNode('Challenges '));
    ui.challengeCount = el('span', null, '0 of ' + BHS.CHALLENGES.length);
    hC.appendChild(ui.challengeCount);
    secC.appendChild(hC);
    var line = el('div', 'line');
    BHS.CHALLENGES.forEach(function (c, i) {
      var s = btn('stop');
      s.title = c.text;
      var dot = el('div', 'dot', String(i + 1));
      var txt = el('div', 'txt');
      txt.appendChild(el('div', 't', c.title));
      txt.appendChild(el('div', 's', c.short));
      var full = el('div', 'note full', c.text);
      full.hidden = true;
      txt.appendChild(full);
      var tag = el('div', 'tag', 'Up next');
      tag.hidden = true;
      s.appendChild(dot); s.appendChild(txt); s.appendChild(tag);
      s.addEventListener('click', function () { BHS.actions.toggleChallenge(i); });
      line.appendChild(s);
      stops.push({ el: s, full: full, tag: tag });
    });
    secC.appendChild(line);
    root.appendChild(secC);

    /* Investigation book */
    var secH = el('div', 'sec');
    var hH = el('h2');
    hH.appendChild(document.createTextNode('Investigation book '));
    ui.hintCount = el('span', null, '0 of ' + BHS.MAX_HINTS + ' asked');
    hH.appendChild(ui.hintCount);
    secH.appendChild(hH);

    var tabRow = el('div', 'tabs');
    ['All'].concat(BHS.CATEGORIES).forEach(function (name) {
      var t = btn('tab');
      t.appendChild(el('i', 'c-' + (CAT_KEY[name] || 'match')));
      t.appendChild(document.createTextNode(name));
      t.addEventListener('click', function () { filter = name; BHS.render(); });
      tabRow.appendChild(t);
      tabs.push({ el: t, name: name });
    });
    secH.appendChild(tabRow);

    var hand = el('div', 'hand');
    BHS.HINTS.forEach(function (h) {
      var key = CAT_KEY[h.cat] || 'match';
      var c = btn('card');
      c.appendChild(el('div', 'band c-' + key));
      var body = el('div', 'body');
      body.appendChild(el('div', 'cat t-' + key, h.cat));
      body.appendChild(el('div', 'hex', h.id));
      body.appendChild(el('div', 'q', h.q));
      var detail = el('div', 'd', h.d);
      body.appendChild(detail);
      var foot = el('div', 'foot');
      var left = el('span', null, 'Cost 1 hint');
      var go = el('span', 'go', 'Ask');
      foot.appendChild(left); foot.appendChild(go);
      body.appendChild(foot);
      c.appendChild(body);
      c.addEventListener('click', function () { BHS.actions.askHint(h.id); });
      hand.appendChild(c);
      cards.push({ el: c, h: h, detail: detail, left: left, go: go });
    });
    secH.appendChild(hand);
    ui.hintNote = el('div', 'note hint-note');
    secH.appendChild(ui.hintNote);
    root.appendChild(secH);

    /* Bottom actions */
    var bottom = el('div', 'bottom');
    var inner = el('div', 'inner');
    ui.btnFound = btn('btn', 'Found the Hider');
    ui.btnFound.addEventListener('click', function () { BHS.actions.found(); });
    ui.btnConcede = btn('btn ghost', 'Concede');
    ui.btnConcede.addEventListener('click', function () { BHS.actions.concede(); });
    ui.endNote = el('div', 'note end-note');
    ui.endNote.hidden = true;
    inner.appendChild(ui.btnFound); inner.appendChild(ui.btnConcede); inner.appendChild(ui.endNote);
    bottom.appendChild(inner);
    root.appendChild(bottom);

    /* Hint reveal overlay, built once and kept off screen until a hint is open */
    var reveal = el('div', 'reveal seeker-reveal');
    reveal.hidden = true;
    var rInner = el('div', 'reveal-inner');
    ui.revealLabel = el('div', 'reveal-label', 'Question asked');
    rInner.appendChild(ui.revealLabel);
    var card = el('div', 'card');
    ui.revealBand = el('div', 'band c-match');
    card.appendChild(ui.revealBand);
    var rBody = el('div', 'body');
    var head = el('div', 'head');
    ui.revealCat = el('div', 'cat t-match', 'Matching');
    ui.revealHex = el('div', 'hex', 'A');
    head.appendChild(ui.revealCat); head.appendChild(ui.revealHex);
    rBody.appendChild(head);
    ui.revealQ = el('div', 'q', '');
    ui.revealD = el('div', 'd', '');
    rBody.appendChild(ui.revealQ); rBody.appendChild(ui.revealD);
    var deadline = el('div', 'deadline');
    var dl = el('div');
    dl.appendChild(el('div', 'cat dim', 'Hider must answer in'));
    ui.revealCd = el('div', 'cd', '05:00');
    dl.appendChild(ui.revealCd);
    ui.revealNth = el('div', 'cat dim', 'Hint 1 of 6');
    deadline.appendChild(dl); deadline.appendChild(ui.revealNth);
    rBody.appendChild(deadline);
    card.appendChild(rBody);
    rInner.appendChild(card);

    var field = el('div', 'field');
    ui.answerInput = document.createElement('input');
    ui.answerInput.type = 'text';
    ui.answerInput.placeholder = 'What did the Hider answer?';
    ui.answerInput.autocomplete = 'off';
    ui.answerInput.setAttribute('aria-label', 'What did the Hider answer?');
    field.appendChild(ui.answerInput);
    rInner.appendChild(field);
    ui.btnRecord = btn('btn yellow', 'Record the answer');
    rInner.appendChild(ui.btnRecord);
    ui.revealHint = el('div', 'note', 'Waiting on WhatsApp. The answer stays true for the moment of the ask.');
    rInner.appendChild(ui.revealHint);
    ui.btnLater = btn('linkbtn', 'Later');
    rInner.appendChild(ui.btnLater);
    reveal.appendChild(rInner);
    root.appendChild(reveal);
    ui.reveal = reveal;

    function record() {
      if (!revealFor) return;
      var text = ui.answerInput.value.trim();
      if (!text) { ui.answerInput.focus(); return; }
      if (BHS.actions.answerHint(revealFor, text)) ui.answerInput.value = '';
    }
    ui.btnRecord.addEventListener('click', record);
    ui.answerInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); record(); } });
    ui.btnLater.addEventListener('click', function () { dismissedFor = revealFor; BHS.render(); });
  }

  function renderLists(d) {
    var BHS = window.BHS, state = BHS.state;
    var play = d.phase === 'play';

    setText(ui.challengeCount, d.challengesDone + ' of ' + BHS.CHALLENGES.length);
    stops.forEach(function (s, i) {
      var done = !!state.challenges[i];
      var next = i === d.nextChallenge && d.phase !== 'ended' && d.phase !== 'timeout';
      setClass(s.el, 'stop' + (done ? ' done' : '') + (next ? ' next' : ''));
      setHidden(s.tag, !(next && play));
      setHidden(s.full, !next);
      setDisabled(s.el, !BHS.canToggleChallenge(i, d));
    });

    setText(ui.hintCount, d.hintsUsed + ' of ' + BHS.MAX_HINTS + ' asked');
    tabs.forEach(function (t) { setClass(t.el, 'tab' + (t.name === filter ? ' on' : '')); });
    cards.forEach(function (c) {
      var asked = state.hints[c.h.id];
      var ans = state.answers[c.h.id];
      setHidden(c.el, filter !== 'All' && c.h.cat !== filter);
      setClass(c.el, 'card' + (asked ? ' used' : '') + (ans ? ' answered' : ''));
      if (asked) {
        setText(c.left, 'Asked ' + BHS.clock(asked));
        setText(c.go, '');
        setText(c.detail, ans ? 'Answer: ' + ans.text : c.h.d);
      } else {
        setText(c.left, 'Cost 1 hint');
        setText(c.go, d.canAskHint ? 'Ask' : '');
        setText(c.detail, c.h.d);
      }
      setDisabled(c.el, !!asked || !d.canAskHint);
    });

    var note, noteClass = 'note hint-note';
    if (d.phase === 'ended' || d.phase === 'timeout') note = 'Game over. ' + plural(d.hintsUsed, 'hint') + ' asked.';
    else if (!play) note = 'Hints unlock once the Seeker starts.';
    else if (d.inBlackout) { note = 'Blackout. No hint requests until ' + BHS.clock(d.blackoutUntil) + '.'; noteClass += ' warn'; }
    else if (d.hintsUsed >= BHS.MAX_HINTS) note = 'All six hints used. The endgame radar is open.';
    else if (d.hintsEarned > 0) { note = plural(d.hintsEarned, 'hint') + ' earned and not yet used. Pick a card.'; noteClass += ' hot'; }
    else note = 'Complete the next challenge to earn a hint.';
    setText(ui.hintNote, note);
    setClass(ui.hintNote, noteClass);

    var over = d.phase === 'ended' || d.phase === 'timeout';
    setHidden(ui.btnFound, over); setHidden(ui.btnConcede, over); setHidden(ui.endNote, !over);
    setDisabled(ui.btnFound, !play); setDisabled(ui.btnConcede, !play);
    if (over) {
      var result = d.winner === 'seeker' ? 'Seeker wins. The Hider was found.' :
        (state.ended === 'hider' ? 'Hider wins. The Seeker conceded.' : 'Hider wins. The hard stop passed.');
      setText(ui.endNote, result + ' The record is on the Record tab.');
    }
  }

  function renderReveal(d, now) {
    var BHS = window.BHS;
    var open = d.openHint;
    var show = !!open && d.phase === 'play' && open.id !== dismissedFor;
    if (!show) {
      if (!ui.reveal.hidden) { ui.reveal.hidden = true; revealFor = null; }
      // Strip on the board while an asked hint waits for its answer.
      var strip = !!open && d.phase === 'play';
      setHidden(ui.openAlert, !strip);
      if (strip) {
        setText(ui.openAlertK, 'Hint ' + open.id + ' asked ' + BHS.clock(open.t));
        var left = open.dueAt - now;
        setText(ui.openAlertCd, left > 0 ? BHS.countdownText(left) : 'overdue');
      }
      return;
    }
    setHidden(ui.openAlert, true);
    if (revealFor !== open.id) {
      revealFor = open.id;
      var key = CAT_KEY[open.hint.cat] || 'match';
      ui.revealBand.className = 'band c-' + key;
      ui.revealCat.className = 'cat t-' + key;
      ui.revealCat.textContent = open.hint.cat;
      ui.revealHex.textContent = open.id;
      ui.revealQ.textContent = open.hint.q;
      ui.revealD.textContent = open.hint.d;
      ui.revealLabel.textContent = 'Question asked at ' + BHS.clock(open.t);
      var n = Object.keys(BHS.state.hints).filter(function (id) { return BHS.state.hints[id] <= open.t; }).length;
      ui.revealNth.textContent = 'Hint ' + n + ' of ' + BHS.MAX_HINTS;
      ui.answerInput.value = '';
    }
    var ms = open.dueAt - now;
    if (ms > 0) { setText(ui.revealCd, BHS.countdownText(ms)); setClass(ui.revealCd, 'cd'); }
    else { setText(ui.revealCd, '00:00 overdue'); setClass(ui.revealCd, 'cd late'); }
    if (ui.reveal.hidden) ui.reveal.hidden = false;
  }

  function render(d, now) {
    var BHS = window.BHS, state = BHS.state;

    var hero = BHS.heroHTML(d, now);
    if (hero !== heroCache) { heroCache = hero; ui.hero.innerHTML = hero; }

    setHidden(ui.endgameAlert, !d.endgameOpen);

    var sig = JSON.stringify([state.challenges, Object.keys(state.hints), Object.keys(state.answers), d.phase, d.canAskHint, d.inBlackout, d.hintsEarned, d.winner, filter]);
    if (sig !== listSig) { listSig = sig; renderLists(d); }

    renderReveal(d, now);
  }

  window.BHS.registerScreen({ id: 'seeker', role: 'seeker', tab: 'Board', order: 10, mount: mount, render: render });
})();
