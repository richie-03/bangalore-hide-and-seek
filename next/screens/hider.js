/* Hider screen: zone graphic, the Relocate card, incoming asks and a mirror of the Seeker's moves.
   Registers with the core in app.js. Nodes are built once in mount and patched in render. */

(function () {
  'use strict';
  var R = {};          // node refs
  var sig = {};        // last rendered signatures per block
  var needChallenge = false;

  function q(el, sel) { return el.querySelector(sel); }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function show(node, on) { if (node.hidden === !!on) node.hidden = !on; }
  function resultLine(d) {
    if (!d.winner) return '';
    if (d.winner === 'seeker') return 'Seeker wins. Found.';
    return d.phase === 'timeout' ? 'Hider wins. Time ran out.' : 'Hider wins. Seeker conceded.';
  }

  var SVG =
    '<svg class="zone hd-svg" viewBox="0 0 220 220" aria-hidden="true">' +
      '<defs><clipPath id="hd-disc"><circle cx="110" cy="100" r="58"/></clipPath></defs>' +
      '<circle cx="110" cy="100" r="98" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="6 6"/>' +
      '<g class="hd-beam" transform="rotate(-38 110 100)"><polygon points="110,100 250,420 -30,420" fill="#e93839"/></g>' +
      '<circle cx="110" cy="100" r="58" fill="#fff"/>' +
      '<g clip-path="url(#hd-disc)"><g class="hd-beam" transform="rotate(-38 110 100)"><polygon points="110,100 190,280 30,280" fill="#453366"/></g></g>' +
      '<circle cx="110" cy="100" r="5" fill="#453366"/>' +
    '</svg>';

  function mount(el) {
    el.innerHTML =
      '<div class="alert hd-ask" hidden>' +
        '<div class="hd-ask-txt"><span class="k"></span><span class="hd-ask-q"></span></div>' +
        '<div class="cd"></div>' +
      '</div>' +
      '<div class="sec hd-answer" hidden>' +
        '<div class="field"><input type="text" class="hd-input" placeholder="Your answer, as sent in WhatsApp" aria-label="Your answer, as sent in WhatsApp" autocomplete="off"></div>' +
        '<button type="button" class="btn yellow hd-stamp">Answer sent, stamp it</button>' +
      '</div>' +
      '<div class="hd-hero"></div>' +
      '<div class="hd-zone">' + SVG +
        '<div class="h-title hd-cap"></div>' +
        '<div class="note hd-sub">400 m around your pin. Wander inside, never leave.</div>' +
      '</div>' +
      '<div class="sec hd-commit-sec" hidden><button type="button" class="btn yellow hd-commit">Zone committed</button></div>' +
      '<div class="sec">' +
        '<h2>Your hand <span class="hd-hand-count">1 card</span></h2>' +
        '<div class="hand">' +
          '<button type="button" class="card hd-relocate">' +
            '<div class="band c-power"></div>' +
            '<div class="body">' +
              '<div class="cat t-power">Powerup</div>' +
              '<div class="hex c-power">&#8635;</div>' +
              '<div class="q">Relocate</div>' +
              '<div class="d">20 min blackout. Move anywhere in the play area, then commit a new pin. Once per game, before endgame.</div>' +
              '<div class="foot"><span>Before endgame</span><span class="play">Play</span></div>' +
            '</div>' +
          '</button>' +
          '<div class="card hd-slot">Cards earned for answering would sit here (roadmap idea).</div>' +
        '</div>' +
      '</div>' +
      '<div class="alert teal hd-hot" hidden>' +
        '<div><span class="k">Endgame ask</span>Within 500 m of the pin?</div>' +
        '<div class="yesno"><button type="button" class="btn yellow hd-yes">Yes</button><button type="button" class="btn hd-no">No</button></div>' +
      '</div>' +
      '<div class="sec">' +
        '<h2>What the Seeker has done</h2>' +
        '<div class="pill-row hd-pills"></div>' +
        '<details class="more hd-mirror">' +
          '<summary>Mirror the Seeker\'s moves</summary>' +
          '<div class="note hd-m-intro">State lives on each phone. Stamp here what the Seeker sends in WhatsApp so the timers on this board match.</div>' +
          '<div class="row hd-m-ask"><select class="hd-sel" aria-label="Hint letter"></select><button type="button" class="btn small yellow hd-asked">Seeker asked this</button></div>' +
          '<div class="note hd-m-note" hidden></div>' +
          '<div class="row hd-m-ch"><button type="button" class="btn small ghost hd-ch"></button></div>' +
          '<div class="row hd-m-hot"><button type="button" class="btn small ghost hd-hotask">Seeker asked within 500 m</button></div>' +
          '<div class="note hd-m-hotnote" hidden></div>' +
        '</details>' +
      '</div>' +
      '<div class="bottom"><div class="inner">' +
        '<div class="h-title hd-result" hidden></div>' +
        '<div class="note hd-foot">Every answer is true for where you stand at the moment of the ask. Never answer from a moving vehicle.</div>' +
      '</div></div>';

    ['hd-ask', 'hd-ask-q', 'hd-answer', 'hd-input', 'hd-stamp', 'hd-hero', 'hd-zone', 'hd-cap', 'hd-commit-sec', 'hd-commit',
     'hd-hand-count', 'hd-relocate', 'hd-hot', 'hd-yes', 'hd-no', 'hd-pills', 'hd-m-ask', 'hd-sel', 'hd-asked', 'hd-m-note',
     'hd-m-ch', 'hd-ch', 'hd-m-hot', 'hd-hotask', 'hd-m-hotnote', 'hd-result', 'hd-mirror'].forEach(function (c) { R[c] = q(el, '.' + c); });
    R.k = q(el, '.hd-ask .k');
    R.cd = q(el, '.hd-ask .cd');

    BHS.HINTS.forEach(function (h) {
      var o = document.createElement('option'); o.value = h.id; o.textContent = h.id + '. ' + h.q; R['hd-sel'].appendChild(o);
    });

    function stamp() {
      var d = BHS.derived(Date.now());
      if (!d.openHint) return;
      var text = R['hd-input'].value.trim();
      if (!text) { R['hd-input'].focus(); return; }
      if (BHS.actions.answerHint(d.openHint.id, text)) R['hd-input'].value = '';
    }
    R['hd-stamp'].addEventListener('click', stamp);
    R['hd-input'].addEventListener('keydown', function (e) { if (e.key === 'Enter') stamp(); });
    R['hd-commit'].addEventListener('click', function () { BHS.actions.commitZone(); });
    R['hd-relocate'].addEventListener('click', function () { BHS.actions.relocate(); });
    R['hd-yes'].addEventListener('click', function () { BHS.actions.hotColdAnswer('yes'); });
    R['hd-no'].addEventListener('click', function () { BHS.actions.hotColdAnswer('no'); });
    R['hd-asked'].addEventListener('click', function () {
      var d = BHS.derived(Date.now());
      if (BHS.actions.askHint(R['hd-sel'].value)) { needChallenge = false; return; }
      if (!d.canAskHint) { needChallenge = true; BHS.render(); }
    });
    R['hd-ch'].addEventListener('click', function () {
      var d = BHS.derived(Date.now());
      if (d.nextChallenge !== -1 && BHS.actions.toggleChallenge(d.nextChallenge)) needChallenge = false;
    });
    R['hd-hotask'].addEventListener('click', function () { BHS.actions.hotColdAsk(); });
  }

  function render(d, now) {
    var s = BHS.state;
    var open = d.phase === 'play' ? d.openHint : null;   // after the end nobody needs an answer

    /* 1. Incoming ask */
    show(R['hd-ask'], !!open);
    show(R['hd-answer'], !!open);
    if (open) {
      var late = now > open.dueAt;
      setText(R.k, 'Incoming ask, hint ' + open.id + (late ? ', overdue' : ''));
      setText(R['hd-ask-q'], open.hint ? open.hint.q : '');
      setText(R.cd, BHS.countdownText(open.dueAt - now));
      R.cd.classList.toggle('late', late);
      R['hd-ask'].classList.toggle('late', late);
      if (sig.openId !== open.id) { sig.openId = open.id; R['hd-input'].value = ''; }
    } else if (sig.openId) { sig.openId = null; }

    /* 2. Hero */
    var hero = BHS.heroHTML(d, now);
    if (sig.hero !== hero) { sig.hero = hero; R['hd-hero'].innerHTML = hero; }

    /* 3. Zone graphic and caption */
    var cap, newZoneMissing = !!s.relocateAt && s.zones.length <= 1;
    if (d.phase === 'headstart') cap = 'Head start, move freely';
    else if (d.phase === 'play' && d.inBlackout && newZoneMissing) cap = 'Relocating, blackout until ' + BHS.clock(d.blackoutUntil);
    else if (d.zoneOpen) cap = 'Commit your zone';
    else if (s.zones.length) cap = 'Zone committed ' + BHS.clock(s.zones[s.zones.length - 1]);
    else cap = d.phase === 'setup' ? 'Waiting to start' : 'No zone committed';
    setText(R['hd-cap'], cap);
    R['hd-zone'].classList.toggle('live', !!open);

    /* 4. Commit button */
    show(R['hd-commit-sec'], d.zoneOpen);

    /* 5. Hand */
    var used = !!s.relocateAt;
    R['hd-relocate'].classList.toggle('used', used);
    R['hd-relocate'].disabled = !d.relocateOpen;
    setText(R['hd-hand-count'], used ? 'Relocate played ' + BHS.clock(s.relocateAt) : '1 card');

    /* 6. Endgame ask */
    show(R['hd-hot'], !!d.hotColdPending);

    /* 7. What the Seeker has done */
    var letters = Object.keys(s.hints).sort();
    var pillSig = d.challengesDone + '|' + letters.join(',') + '|' + s.hotCold.length;
    if (sig.pills !== pillSig) {
      sig.pills = pillSig;
      R['hd-pills'].innerHTML =
        '<div class="pill"><b>Challenges</b>' + d.challengesDone + ' of ' + BHS.CHALLENGES.length + '</div>' +
        '<div class="pill"><b>Hints asked</b>' + (letters.length ? letters.join(', ') : 'none yet') + '</div>' +
        (s.hotCold.length ? '<div class="pill"><b>Endgame asks</b>' + s.hotCold.length + '</div>' : '');
    }

    /* Mirror block, only while the Seeker can still do things */
    var playing = d.phase === 'play';
    show(R['hd-mirror'], playing);
    var askRow = playing && !open;
    show(R['hd-m-ask'], askRow);
    if (askRow) {
      var sel = R['hd-sel'];
      var selSig = letters.join(',');
      if (sig.sel !== selSig) {
        sig.sel = selSig;
        Array.prototype.forEach.call(sel.options, function (o) { o.disabled = !!s.hints[o.value]; });
        if (document.activeElement !== sel && s.hints[sel.value]) {
          for (var i = 0; i < sel.options.length; i++) if (!sel.options[i].disabled) { sel.value = sel.options[i].value; break; }
        }
      }
      if (d.canAskHint) needChallenge = false;
      var note = '';
      if (d.inBlackout) note = 'No hints during the blackout.';
      else if (d.hintsUsed >= BHS.MAX_HINTS) note = 'All six hints used.';
      else if (needChallenge) note = 'Mark the Seeker\'s completed challenge first.';
      show(R['hd-m-note'], !!note);
      setText(R['hd-m-note'], note);
      R['hd-asked'].disabled = !d.canAskHint && !needChallenge && (d.inBlackout || d.hintsUsed >= BHS.MAX_HINTS);
    } else {
      show(R['hd-m-note'], false);
    }
    var chRow = playing && d.nextChallenge !== -1;
    show(R['hd-m-ch'], chRow);
    if (chRow) {
      setText(R['hd-ch'], 'Seeker completed challenge ' + (d.nextChallenge + 1) + ', ' + BHS.CHALLENGES[d.nextChallenge].title);
      R['hd-ch'].disabled = !BHS.canToggleChallenge(d.nextChallenge, d);
    }
    var hotRow = d.endgameOpen && !d.hotColdPending;
    show(R['hd-m-hot'], hotRow && d.hotColdReady);
    var hotNote = hotRow && !d.hotColdReady ? 'Next within 500 m ask possible at ' + BHS.clock(d.hotColdNextAt) + '.' : '';
    show(R['hd-m-hotnote'], !!hotNote);
    setText(R['hd-m-hotnote'], hotNote);

    /* 8. Bottom */
    var res = resultLine(d);
    show(R['hd-result'], !!res);
    setText(R['hd-result'], res);
  }

  BHS.registerScreen({ id: 'hider', role: 'hider', tab: 'Zone', order: 10, mount: mount, render: render });
})();
