/* Endgame screen (Seeker). The "within 500 m?" ask, once every 10 minutes once the endgame opens.
   Radar picture: YES answers land inside the inner ring, NO answers in the outer band,
   an unanswered ask sits as a hollow ring while the sweep runs. */

(function () {
  'use strict';
  var n = {};
  var lastHero = '', lastMarkers = '';
  var SIZE = 300, R_YES = 26, R_OPEN = 75, R_NO = 125;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function pill(label) {
    var p = el('div', 'pill'); p.appendChild(el('b', null, label));
    var v = document.createTextNode(''); p.appendChild(v);
    return { el: p, v: v };
  }

  function mount(root) {
    n.hero = el('div');
    root.appendChild(n.hero);

    var head = el('div', 'eg-head');
    n.egLabel = el('div', 'eg-label', 'Endgame locked');
    head.appendChild(n.egLabel);
    head.appendChild(el('div', 'h-title', 'Within 500 m of you?'));
    root.appendChild(head);

    var radar = el('div', 'radar');
    radar.setAttribute('aria-hidden', 'true');
    radar.appendChild(el('div', 'ring out'));
    radar.appendChild(el('div', 'ring mid'));
    radar.appendChild(el('div', 'ring in'));
    n.sweep = el('div', 'sweep'); n.sweep.hidden = true;
    radar.appendChild(n.sweep);
    n.marks = el('div', 'marks');
    radar.appendChild(n.marks);
    radar.appendChild(el('div', 'centre'));
    root.appendChild(radar);
    n.radarNote = el('div', 'note radar-note', '0 asks so far');
    root.appendChild(n.radarNote);

    var pills = el('div', 'sec');
    var row = el('div', 'pill-row');
    n.pAsks = pill('Asks so far'); n.pLast = pill('Last'); n.pNext = pill('Next ask in');
    row.appendChild(n.pAsks.el); row.appendChild(n.pLast.el); row.appendChild(n.pNext.el);
    pills.appendChild(row);
    root.appendChild(pills);

    n.alert = el('div', 'alert teal ask');
    var top = el('div', 'top');
    var txt = el('div');
    txt.appendChild(el('span', 'k', 'Waiting for the Hider'));
    txt.appendChild(document.createTextNode('Record the answer that came back in the chat.'));
    top.appendChild(txt);
    n.due = el('div', 'cd', '05:00');
    top.appendChild(n.due);
    n.alert.appendChild(top);
    var yn = el('div', 'yesno');
    var yes = el('button', 'btn yellow', 'Yes'); yes.type = 'button';
    var no = el('button', 'btn', 'No'); no.type = 'button';
    yes.addEventListener('click', function () { BHS.actions.hotColdAnswer('yes'); });
    no.addEventListener('click', function () { BHS.actions.hotColdAnswer('no'); });
    yn.appendChild(yes); yn.appendChild(no);
    n.alert.appendChild(yn);
    n.alert.hidden = true;
    root.appendChild(n.alert);

    var notes = el('div', 'sec');
    notes.appendChild(el('div', 'note', 'Send a one-time WhatsApp pin with the ask. The Hider measures straight-line distance to the pin and answers yes (500 m or less) or no within 5 minutes. The answer is about the pin, not where you are when it arrives.'));
    n.locked = el('div', 'note eg-locked');
    notes.appendChild(n.locked);
    root.appendChild(notes);

    var bottom = el('div', 'bottom');
    var inner = el('div', 'inner');
    n.ask = el('button', 'btn', 'Ask: within 500 m?'); n.ask.type = 'button';
    n.ask.addEventListener('click', function () { BHS.actions.hotColdAsk(); });
    inner.appendChild(n.ask);
    bottom.appendChild(inner);
    root.appendChild(bottom);
  }

  function markerSig(list) {
    var s = '';
    for (var i = 0; i < list.length; i++) s += list[i].t + (list[i].a || '-') + '|';
    return s;
  }
  function buildMarkers(list) {
    n.marks.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var a = list[i].a;
      var m = el('div', 'mark ' + (a === 'yes' ? 'yes' : a === 'no' ? 'no' : 'open'), a === 'yes' ? 'YES' : a === 'no' ? 'NO' : '?');
      var r = a === 'yes' ? R_YES : a === 'no' ? R_NO : R_OPEN;
      var ang = (i * 137 - 90) * Math.PI / 180;
      m.style.left = (SIZE / 2 + r * Math.cos(ang)).toFixed(1) + 'px';
      m.style.top = (SIZE / 2 + r * Math.sin(ang)).toFixed(1) + 'px';
      m.title = BHS.clock(list[i].t) + ' ' + (a ? a.toUpperCase() : 'waiting');
      n.marks.appendChild(m);
    }
  }

  function render(d, now) {
    var s = BHS.state;
    var list = s.hotCold;
    var last = list.length ? list[list.length - 1] : null;
    var pending = d.hotColdPending;
    var over = d.phase === 'ended' || d.phase === 'timeout';

    var hero = BHS.heroHTML(d, now, true);
    if (hero !== lastHero) { n.hero.innerHTML = hero; lastHero = hero; }

    setText(n.egLabel, d.endgameOpen ? 'Endgame open' : 'Endgame locked');

    var sig = markerSig(list);
    if (sig !== lastMarkers) { buildMarkers(list); lastMarkers = sig; }
    if (n.sweep.hidden === !!pending) n.sweep.hidden = !pending;
    setText(n.radarNote, list.length + (list.length === 1 ? ' ask' : ' asks') + ' so far');

    setText(n.pAsks.v, String(list.length));
    setText(n.pLast.v, last ? BHS.clock(last.t) + ' ' + (last.a ? last.a.toUpperCase() : 'waiting') : 'none');
    var next;
    if (!d.endgameOpen) next = 'locked';
    else if (d.hotColdReady) next = 'now';
    else next = BHS.countdownText(d.hotColdNextAt - now);
    setText(n.pNext.v, next);

    if (n.alert.hidden === !!pending) n.alert.hidden = !pending;
    if (pending) {
      var left = pending.t + BHS.ANSWER_MS - now;
      setText(n.due, left > 0 ? BHS.countdownText(left) : 'late');
      n.due.classList.toggle('late', left <= 0);
    }

    var showLocked = !d.endgameOpen && !over;
    if (n.locked.hidden === showLocked) n.locked.hidden = !showLocked;
    if (showLocked) setText(n.locked, 'Unlocks when all six hints are used or at ' + (d.endgameAt ? BHS.clock(d.endgameAt) : '--:--') + ' (3 hours after the Seeker starts).');

    var label, on = false;
    if (pending) label = 'Record the Hider\'s answer first';
    else if (over) label = 'Game over';
    else if (!d.endgameOpen) label = 'Locked until endgame';
    else if (d.hotColdReady) { label = 'Ask: within 500 m?'; on = true; }
    else label = 'Ask again in ' + BHS.countdownText(d.hotColdNextAt - now);
    setText(n.ask, label);
    if (n.ask.disabled === on) n.ask.disabled = !on;
  }

  BHS.registerScreen({ id: 'endgame', role: 'seeker', tab: 'Radar', order: 20, mount: mount, render: render });
})();
