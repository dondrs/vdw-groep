/* Van der Wal Groep - eigen JS (sitebreed geladen via jsDelivr)
   Alleen wat niet in Webflow zelf kan. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Formulierknoppen
     De verzendknoppen in de nieuwsbrief- en contactformulieren zijn
     Button-icon-componenten (links), geen echte submit-knoppen. Webflow kan
     een link niet als submit instellen, dus vangen we de klik hier af en
     versturen we het omliggende formulier. Validatie blijft werken.
     ------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('form .btn-icon-link');
    if (!link) return;
    var form = link.closest('form');
    if (!form) return;
    e.preventDefault();
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else if (form.reportValidity()) {
      form.submit();
    }
  });

  /* ------------------------------------------------------------------
     2. Fourage-producten: zoeken, filteren, sorteren, lijst/grid
     Markup en styling staan in Webflow (Filter__bar, Filter__chip, ...).
     Dit script leest de data-vdw-* attributen die aan de CMS gekoppeld zijn.
     ------------------------------------------------------------------ */

  // Zoekwoorden die klanten gebruiken -> termen die in de data voorkomen
  var SYNONYMS = {
    koe: ['melkvee', 'rundvee', 'vleesvee'], koeien: ['melkvee', 'rundvee'],
    rund: ['rundvee', 'melkvee', 'vleesvee'], rundvee: ['melkvee', 'vleesvee', 'jongvee'],
    melk: ['melkvee'], kalf: ['jongvee'], kalveren: ['jongvee'], pinken: ['jongvee'],
    vlees: ['vleesvee'], stier: ['vleesvee'],
    bio: ['biologisch'], organisch: ['biologisch', 'compost', 'mest'], eko: ['biologisch'],
    mest: ['mest', 'compost', 'champost', 'kunstmest'], bemesting: ['kunstmest', 'compost', 'mest'],
    bodem: ['compost', 'kunstmest', 'champost'], meststof: ['kunstmest', 'compost'],
    strooisel: ['strooisel', 'zaagsel', 'kalk', 'stro', 'ligbox'], strooi: ['strooisel'],
    ligbox: ['ligboxen', 'strooisel'], box: ['ligboxen', 'diepstrooisel'], stal: ['strooisel', 'potstallen', 'ligboxen'],
    silage: ['kuilgras', 'voordroog'], kuil: ['kuilgras'], kuilbaal: ['kuilgras', 'voordroog'],
    gras: ['gras', 'kuilgras', 'voordroog', 'graszaad', 'weidehooi'],
    mais: ['mais', 'snijmais', 'maisbalen'], snijmais: ['mais'],
    korrel: ['korrel', 'pellet'], korrels: ['korrel', 'pellet'], pellet: ['pellet', 'korrel'], brok: ['pellet', 'korrel'],
    aardappel: ['aardappel'], piepers: ['aardappel'], biet: ['biet', 'pulp'], bieten: ['biet', 'pulp'],
    ruwvoer: ['hooi', 'stro', 'kuilgras', 'luzerne', 'ruwvoer'], voer: ['ruwvoer', 'rantsoen'],
    vezel: ['vezel', 'structuur', 'stro'], structuur: ['structuur', 'stro', 'hooi']
  };

  function norm(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Levenshtein <= 1, voor kleine typfouten ("luzern", "kuilgars")
  function nearlyEqual(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > 1) return false;
      prev = cur;
    }
    return prev[b.length] <= 1;
  }

  function attr(el, name) { return el.getAttribute(name) || ''; }

  function initProductFilter(root) {
    if (!root || root._vdwFilter) return;
    var list = root.querySelector('[data-vdw-list]');
    var bar = root.querySelector('[data-vdw-filterbar]');
    if (!list || !bar) return;
    root._vdwFilter = true;

    var input = root.querySelector('[data-live-search-input]');
    var empty = root.querySelector('[data-vdw-empty]');
    var resultEl = root.querySelector('[data-vdw-result]');
    var activeEl = root.querySelector('[data-vdw-active]');
    var emptyText = empty ? empty.querySelector('p') : null;

    // ---- Data verzamelen uit de CMS-attributen
    var items = Array.prototype.map.call(list.querySelectorAll('[data-vdw-item]'), function (el, i) {
      var toep = ['t1', 't2', 't3', 't4', 't5', 't6'].map(function (k) { return attr(el, 'data-vdw-' + k); }).filter(Boolean);
      var eig = ['e1', 'e2', 'e3', 'e4'].map(function (k) { return attr(el, 'data-vdw-' + k); }).filter(Boolean);
      var extra = ['f1', 'f2', 'pc', 'oc'].map(function (k) { return attr(el, 'data-vdw-' + k); }).filter(Boolean);
      var bioTag = el.querySelector('[data-vdw-biotag]');
      var bio = !!bioTag && !bioTag.classList.contains('w-condition-invisible');
      var heading = el.querySelector('h4');
      var name = attr(el, 'data-vdw-name') || (heading ? heading.textContent : '');
      var cat = attr(el, 'data-vdw-cat');
      var rec = {
        el: el, i: i, heading: heading, name: name, cat: cat, bio: bio,
        nName: norm(name), nCat: norm(cat), nDesc: norm(attr(el, 'data-vdw-desc')),
        nToep: norm(toep.join(' ')), nEig: norm(eig.concat(extra).join(' ') + (bio ? ' biologisch' : ''))
      };
      rec.words = (rec.nName + ' ' + rec.nCat + ' ' + rec.nDesc + ' ' + rec.nToep + ' ' + rec.nEig).split(' ');
      return rec;
    });
    var total = items.length;

    // ---- State (uit URL en localStorage)
    var state = { q: '', cat: '', toep: [], bio: false, sort: 'az', sortChosen: false, view: 'list' };
    try {
      var p = new URLSearchParams(location.search);
      state.q = p.get('q') || '';
      state.cat = p.get('cat') || '';
      state.toep = (p.get('toep') || '').split(',').filter(Boolean);
      state.bio = p.get('bio') === '1';
      if (p.get('sort')) { state.sort = p.get('sort'); state.sortChosen = true; }
      state.view = p.get('view') || localStorage.getItem('vdw-view') || 'list';
    } catch (err) { /* standaardwaarden */ }
    if (input) input.value = state.q;

    // ---- Matching en score
    function termMatches(rec, t) {
      var cands = [t].concat(SYNONYMS[t] || []);
      var score = 0;
      cands.forEach(function (c, idx) {
        var w = idx === 0 ? 1 : 0.6; // synoniem telt iets minder
        if (rec.nName.indexOf(c) === 0) score = Math.max(score, 6 * w);
        else if (rec.nName.indexOf(c) > -1) score = Math.max(score, 4 * w);
        else if (rec.nCat.indexOf(c) > -1) score = Math.max(score, 2.5 * w);
        else if (rec.nToep.indexOf(c) > -1 || rec.nEig.indexOf(c) > -1) score = Math.max(score, 2 * w);
        else if (rec.nDesc.indexOf(c) > -1) score = Math.max(score, 1 * w);
      });
      if (!score && t.length >= 4) {
        for (var k = 0; k < rec.words.length; k++) {
          if (rec.words[k].length >= 3 && nearlyEqual(t, rec.words[k])) { score = 1; break; }
        }
      }
      return score;
    }

    function queryScore(rec, terms) {
      if (!terms.length) return 1;
      var sum = 0;
      for (var i = 0; i < terms.length; i++) {
        var s = termMatches(rec, terms[i]);
        if (!s) return 0; // alle zoekwoorden moeten matchen
        sum += s;
      }
      return sum;
    }

    function passes(rec, s) {
      if (s.cat && rec.cat !== s.cat) return false;
      if (s.bio && !rec.bio) return false;
      if (s.toep.length) {
        var ok = s.toep.some(function (t) { return rec.nToep.indexOf(norm(t)) > -1; });
        if (!ok) return false;
      }
      return true;
    }

    // ---- Render
    function highlight(rec, terms) {
      if (!rec.heading) return;
      if (!terms.length) { rec.heading.textContent = rec.name; return; }
      var plain = norm(rec.name);
      if (plain.length !== rec.name.length) { rec.heading.textContent = rec.name; return; }
      var marks = [];
      terms.forEach(function (t) {
        var at = plain.indexOf(t);
        if (at > -1) marks.push([at, at + t.length]);
      });
      if (!marks.length) { rec.heading.textContent = rec.name; return; }
      marks.sort(function (a, b) { return a[0] - b[0]; });
      var out = '', pos = 0;
      marks.forEach(function (m) {
        if (m[0] < pos) return;
        out += esc(rec.name.slice(pos, m[0])) + '<mark class="vdw-hl">' + esc(rec.name.slice(m[0], m[1])) + '</mark>';
        pos = m[1];
      });
      rec.heading.innerHTML = out + esc(rec.name.slice(pos));
    }

    function toggle(b, on) {
      b.classList.toggle('is--active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function setActiveButtons() {
      bar.querySelectorAll('[data-vdw-filter="cat"]').forEach(function (b) { toggle(b, attr(b, 'data-value') === state.cat); });
      bar.querySelectorAll('[data-vdw-filter="toep"]').forEach(function (b) { toggle(b, state.toep.indexOf(attr(b, 'data-value')) > -1); });
      bar.querySelectorAll('[data-vdw-filter="bio"]').forEach(function (b) { toggle(b, state.bio); });
      root.querySelectorAll('[data-vdw-sort]').forEach(function (b) {
        toggle(b, state.sortChosen ? attr(b, 'data-vdw-sort') === state.sort : (!state.q && attr(b, 'data-vdw-sort') === 'az'));
      });
      root.querySelectorAll('[data-vdw-view]').forEach(function (b) { toggle(b, attr(b, 'data-vdw-view') === state.view); });
    }

    // Aantallen per filter, rekening houdend met de andere actieve filters
    function updateCounts(scored) {
      function countFor(mod) {
        var s = Object.assign({}, state, mod);
        var n = 0;
        scored.forEach(function (r) { if (r.score > 0 && passes(r.rec, s)) n++; });
        return n;
      }
      bar.querySelectorAll('[data-vdw-filter]').forEach(function (b) {
        var type = attr(b, 'data-vdw-filter'), val = attr(b, 'data-value'), n;
        if (type === 'cat') n = countFor({ cat: val });
        else if (type === 'toep') n = countFor({ toep: state.toep.indexOf(val) > -1 ? state.toep : state.toep.concat([val]) });
        else n = countFor({ bio: true });
        var c = b.querySelector('[data-vdw-count]');
        if (c) c.textContent = n;
        b.setAttribute('aria-disabled', (n === 0 && !b.classList.contains('is--active')) ? 'true' : 'false');
      });
    }

    function renderActive() {
      var tags = [];
      if (state.q) tags.push({ k: 'q', label: '“' + state.q + '”' });
      if (state.cat) tags.push({ k: 'cat', label: state.cat });
      state.toep.forEach(function (t) { tags.push({ k: 'toep', v: t, label: t.charAt(0).toUpperCase() + t.slice(1) }); });
      if (state.bio) tags.push({ k: 'bio', label: 'Biologisch' });
      if (activeEl) {
        activeEl.innerHTML = tags.map(function (t) {
          return '<button type="button" class="filter__chip vdw-tag" data-vdw-remove="' + t.k + '"' +
            (t.v ? ' data-value="' + esc(t.v) + '"' : '') + ' aria-label="Verwijder filter ' + esc(t.label) + '">' +
            esc(t.label) + '<span class="vdw-tag__x" aria-hidden="true">×</span></button>';
        }).join('');
      }
      root.querySelectorAll('[data-vdw-filterbar] [data-vdw-reset]').forEach(function (r) {
        r.style.display = tags.length ? '' : 'none';
      });
    }

    function syncUrl() {
      try {
        var p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.cat) p.set('cat', state.cat);
        if (state.toep.length) p.set('toep', state.toep.join(','));
        if (state.bio) p.set('bio', '1');
        if (state.sortChosen) p.set('sort', state.sort);
        if (state.view !== 'list') p.set('view', state.view);
        var qs = p.toString();
        history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
        localStorage.setItem('vdw-view', state.view);
      } catch (err) { /* negeren */ }
    }

    function apply() {
      var terms = norm(state.q).split(' ').filter(Boolean);
      var scored = items.map(function (rec) { return { rec: rec, score: queryScore(rec, terms) }; });
      var visible = scored.filter(function (r) { return r.score > 0 && passes(r.rec, state); });

      var sort = state.sortChosen ? state.sort : (terms.length ? 'relevance' : 'az');
      visible.sort(function (a, b) {
        if (sort === 'relevance' && b.score !== a.score) return b.score - a.score;
        if (sort === 'za') return b.rec.name.localeCompare(a.rec.name, 'nl');
        if (sort === 'cat') {
          var c = a.rec.cat.localeCompare(b.rec.cat, 'nl');
          if (c) return c;
        }
        return a.rec.name.localeCompare(b.rec.name, 'nl');
      });

      var shown = {};
      visible.forEach(function (r) {
        shown[r.rec.i] = true;
        if (r.rec.el.hidden) {
          r.rec.el.hidden = false;
          r.rec.el.classList.remove('vdw-in'); void r.rec.el.offsetWidth; r.rec.el.classList.add('vdw-in');
        }
        list.appendChild(r.rec.el);
        highlight(r.rec, terms);
      });
      items.forEach(function (rec) { if (!shown[rec.i]) rec.el.hidden = true; });

      list.setAttribute('data-view', state.view);
      if (resultEl) {
        resultEl.textContent = visible.length === total
          ? total + ' producten'
          : visible.length + ' van ' + total + ' producten';
      }
      if (empty) {
        empty.style.display = visible.length ? 'none' : 'flex';
        if (emptyText) {
          emptyText.textContent = state.q
            ? 'Geen producten gevonden voor “' + state.q + '”. Probeer een ander zoekwoord of minder filters.'
            : 'Geen producten gevonden met deze filters. Probeer minder filters.';
        }
      }
      updateCounts(scored);
      setActiveButtons();
      renderActive();
      syncUrl();
    }

    // ---- Events
    var timer;
    if (input) {
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.q = input.value.trim(); apply(); }, 120);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { input.value = ''; state.q = ''; apply(); }
        if (e.key === 'Enter') e.preventDefault();
      });
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-vdw-filter')) {
        if (b.getAttribute('aria-disabled') === 'true') return;
        var type = attr(b, 'data-vdw-filter'), val = attr(b, 'data-value');
        if (type === 'cat') state.cat = state.cat === val ? '' : val;
        else if (type === 'toep') {
          var i = state.toep.indexOf(val);
          if (i > -1) state.toep.splice(i, 1); else state.toep.push(val);
        } else if (type === 'bio') state.bio = !state.bio;
      } else if (b.hasAttribute('data-vdw-suggest')) {
        state.q = attr(b, 'data-vdw-suggest');
        if (input) input.value = state.q;
      } else if (b.hasAttribute('data-vdw-sort')) {
        state.sort = attr(b, 'data-vdw-sort'); state.sortChosen = true;
      } else if (b.hasAttribute('data-vdw-view')) {
        state.view = attr(b, 'data-vdw-view');
      } else if (b.hasAttribute('data-vdw-remove')) {
        var k = attr(b, 'data-vdw-remove');
        if (k === 'q') { state.q = ''; if (input) input.value = ''; }
        else if (k === 'cat') state.cat = '';
        else if (k === 'bio') state.bio = false;
        else if (k === 'toep') state.toep = state.toep.filter(function (x) { return x !== attr(b, 'data-value'); });
      } else if (b.hasAttribute('data-vdw-reset')) {
        state.q = ''; state.cat = ''; state.toep = []; state.bio = false;
        if (input) input.value = '';
      } else {
        return;
      }
      e.preventDefault();
      apply();
    });

    apply();
  }

  // "/" focust de zoekbalk (eenmalig sitebreed geregistreerd)
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/') return;
    var input = document.querySelector('[data-vdw-filter-root] [data-live-search-input]');
    if (!input) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    input.focus();
  });

  function initAll() {
    document.querySelectorAll('[data-vdw-filter-root]').forEach(initProductFilter);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();

  // Barba (paginatransities): opnieuw initialiseren na elke paginawissel
  function hookBarba() {
    if (window.barba && window.barba.hooks && !hookBarba.done) {
      hookBarba.done = true;
      window.barba.hooks.afterEnter(function () { setTimeout(initAll, 0); });
    }
  }
  hookBarba();
  window.addEventListener('load', hookBarba);
})();
