/* Record screen (both roles). The log as a chat transcript, the rules in short, copy and reset.
   Uses the shared .feed and .msg classes from style.css, no stylesheet of its own. */

(function () {
  'use strict';
  var n = {};
  var lastSig = null;

  var RULES = [
    ['Play area', [
      'The Hider must be inside one of these at all times: Cubbon Park, MG Road / Church Street / CBD, Ulsoor, Shanti Nagar, Richmond Town, Domlur, Indiranagar (up to 100 Feet Road), Koramangala (all blocks), Jayanagar (all blocks), Basavanagudi, Lalbagh. If it is not on the list, it is out.',
      'Transport for both players: walking, metro, buses, autos, cabs. No personal vehicle.'
    ]],
    ['Hider', [
      'Free movement during the head start. When the Seeker starts, commit to a zone of about 400 m around a point: drop a pin in Google Maps and screenshot it with the clock visible. Wander inside the zone, never leave it.',
      'Zone: not within 750 m of home, public and free-entry only, no private homes, no bathrooms, no floors above ground level. Must be findable by someone walking the zone.',
      'Every answer is true for where you stand at the moment of the request. Photos are taken then, unedited, and must show the street. Answer within 5 minutes.',
      'Seeker challenge proof photos go to the Hider. That is deliberate.'
    ]],
    ['Seeker', [
      'One hint per completed challenge. Challenges in order, done wherever you are, proof by photo in the chat. Six hints maximum, any order from the menu.'
    ]],
    ['Winning', [
      'Seeker wins when within about 20 m of the Hider and sends a photo of the Hider to the chat. Hider wins if the hard stop (5 hours after the Seeker starts) passes. If the Hider was ever outside the zone or play area, the Hider forfeits.'
    ]],
    ['Endgame ask', [
      'Seeker attaches a one-time WhatsApp location (not live, not an area name) with the ask. Hider opens the pin in Google Maps, long-presses their own position, uses Measure distance, and answers YES if 500 m or less, else NO, within 5 minutes. The answer is about the pin. The Hider may not shift position to change the answer.'
    ]]
  ];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function who(m) {
    if (/^(Challenge|Unchecked challenge|Hint [A-Z] asked|Within 500 m\? asked|Seeker found|Seeker conceded)/.test(m)) return 'seeker';
    if (/^(Zone committed|Relocate used|Hint [A-Z] answered|Within 500 m\? answered)/.test(m)) return 'hider';
    return 'sys';
  }

  function mount(root) {
    var top = el('div', 'sec');
    var h2 = el('h2', null, 'Official record');
    h2.style.gap = '12px'; h2.style.whiteSpace = 'nowrap';
    var sub = el('span', null, 'WhatsApp timestamps decide disputes');
    sub.style.whiteSpace = 'normal'; sub.style.textAlign = 'right'; sub.style.fontSize = '11px'; sub.style.letterSpacing = '1px';
    h2.appendChild(sub);
    top.appendChild(h2);
    root.appendChild(top);

    var wrap = el('div', 'sec');
    n.feed = el('div', 'feed');
    n.feed.setAttribute('aria-live', 'polite');
    // The feed scrolls on its own so the newest entry is always in reach above the fixed buttons.
    n.feed.style.maxHeight = 'calc(100vh - 420px)';
    n.feed.style.minHeight = '160px';
    n.feed.style.overflowY = 'auto';
    n.feed.style.webkitOverflowScrolling = 'touch';
    n.feed.style.paddingBottom = '4px';
    wrap.appendChild(n.feed);
    n.empty = el('div', 'note', 'Nothing recorded yet.');
    n.empty.style.textAlign = 'center';
    n.empty.style.padding = '24px 0';
    wrap.appendChild(n.empty);
    root.appendChild(wrap);

    var rules = el('div', 'sec');
    var more = el('details', 'more');
    more.appendChild(el('summary', null, 'Rules in short'));
    RULES.forEach(function (r) {
      var sec = el('div');
      sec.style.marginTop = '10px';
      var h = el('div', null, r[0]);
      h.style.fontWeight = '800'; h.style.fontSize = '13px'; h.style.textTransform = 'uppercase'; h.style.letterSpacing = '1.2px';
      sec.appendChild(h);
      r[1].forEach(function (p) { var pe = el('p', 'note', p); pe.style.margin = '6px 0 0'; sec.appendChild(pe); });
      more.appendChild(sec);
    });
    var links = el('p', 'note');
    links.style.margin = '12px 0 0';
    links.appendChild(document.createTextNode('Full text: '));
    var a = el('a', null, 'RULES.md'); a.href = 'https://github.com/richie-03/bangalore-hide-and-seek/blob/main/RULES.md'; a.target = '_blank'; a.rel = 'noopener';
    links.appendChild(a);
    links.appendChild(document.createTextNode('. Try the board without waiting: '));
    var t = el('a', null, 'test mode'); t.href = '?test=1';
    links.appendChild(t);
    links.appendChild(document.createTextNode('.'));
    more.appendChild(links);
    rules.appendChild(more);
    root.appendChild(rules);

    var bottom = el('div', 'bottom');
    var inner = el('div', 'inner');
    var copy = el('button', 'btn ghost', 'Copy record to WhatsApp'); copy.type = 'button';
    copy.addEventListener('click', function () { BHS.actions.copyLog(); });
    inner.appendChild(copy);
    var note = el('div', 'note');
    var reset = el('button', 'linkbtn danger', 'Reset game'); reset.type = 'button';
    reset.addEventListener('click', function () { BHS.actions.reset(); });
    note.appendChild(reset);
    inner.appendChild(note);
    inner.appendChild(el('div', 'note', 'V2 in development. Rebalance after the game, not during it.'));
    bottom.appendChild(inner);
    root.appendChild(bottom);
  }

  function build(log) {
    n.feed.innerHTML = '';
    var last = null;
    for (var i = log.length - 1; i >= 0; i--) {
      var e = log[i];
      var m = el('div', 'msg ' + who(e.m));
      if (m.className === 'msg hider') { m.appendChild(el('b', null, 'Hider')); m.appendChild(document.createTextNode(' ')); }
      m.appendChild(document.createTextNode(e.m));
      var time = el('time', null, BHS.clockS(e.t));
      time.setAttribute('datetime', new Date(e.t).toISOString());
      m.appendChild(time);
      n.feed.appendChild(m);
      last = m;
    }
    return last;
  }

  function render(d, now) {
    var log = BHS.state.log;
    var sig = log.length + ':' + (log.length ? log[0].t + log[0].m : '');
    if (sig === lastSig) return;
    lastSig = sig;
    var last = build(log);
    n.empty.hidden = !!last;
    n.feed.hidden = !last;
    if (last) n.feed.scrollTop = n.feed.scrollHeight;
  }

  BHS.registerScreen({ id: 'record', role: 'both', tab: 'Record', order: 30, mount: mount, render: render });
})();
