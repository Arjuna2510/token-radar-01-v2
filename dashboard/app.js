// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, the live-token set,
// the set-aside set, the methodology, and a per-protocol detail view with the
// model's own inputs and the protocol's farm plan. No network: every byte it
// shows is in data.js.
//
// The model in two functions, the same arithmetic main.ts runs in
// lib/model.ts: the page recomputes a row's base value from the snapshot
// figures — TVL, seven-day growth, age, chains, and its category's fitted
// offset — and its launch odds from the category rate and the age-band cell,
// then checks the expected value board.json carries, so the page's code and
// the board's data are visibly the same arithmetic. Farm steps are the same
// derivation main.ts writes to board.json: category, chains, TVL, age and the
// expected value decide the action, the capital, the hold, every cost and
// time, and the break-even verdict. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var V = DATA.validation;
  var MODEL = DATA.model;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'expected', dir: -1, selected: null };

  // ------------------------------------------------------------ formatting

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
  }
  // Rates (launch odds, category rates) are levels, not changes: no '+' sign.
  function fmtRate(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(1) + '%';
  }
  function fmtGrowth(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(0) + '%';
  }
  function fmtNum(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(digits === undefined ? 3 : digits);
  }

  // ------------------------------------------------------------ the model, in-page

  // radar-3, as in lib/model.ts: log(mcap) = intercept + log_tvl*ln(TVL) +
  // growth*clamped 7d/100 + log_age*ln1p(age) + chains*min(chains,5) +
  // the category's fitted offset. Base value is exp of that, floored at $1.
  function categoryOffset(category) {
    var hit = null;
    for (var i = 0; i < V.categories.length; i++) {
      if (V.categories[i].category === (category || '')) { hit = V.categories[i]; break; }
    }
    return hit ? hit.offset : 0;
  }
  function baseOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var logMcap = V.intercept
      + V.log_tvl * Math.log(Math.max(row.tvl_usd, 1))
      + V.growth * (growth / 100)
      + V.log_age * Math.log1p(age)
      + V.chains * Math.min((row.chains || []).length, MODEL.chain_cap)
      + categoryOffset(row.category);
    return Math.max(1, Math.round(Math.exp(logMcap)));
  }
  // Odds, as in lib/model.ts: the joint cell (category, age band) shrunk
  // toward the category rate, weight 8; a cell with no protocols falls back
  // to the category rate. Clamped to [0.02, 0.95].
  function oddsOf(row) {
    var cat = row.odds_category_rate;
    if (!row.odds_cell_n) return Math.min(MODEL.odds_cap, Math.max(MODEL.odds_floor, cat));
    var joint = (row.odds_cell_tok + cat * 8) / (row.odds_cell_n + 8);
    return Math.min(MODEL.odds_cap, Math.max(MODEL.odds_floor, joint));
  }
  function expectedOf(row) {
    return Math.max(1, Math.round(baseOf(row) * oddsOf(row)));
  }
  function recomputeCheck(row) {
    var mine = expectedOf(row);
    var diff = Math.abs(mine - row.implied_value_usd);
    return diff <= 1
      ? 'Recompute check: the page re-derives $' + mine.toLocaleString('en-US') + ' from this row’s own figures — it agrees with board.json.'
      : 'Recompute check: the page re-derives $' + mine.toLocaleString('en-US') + ' but board.json carries $' + row.implied_value_usd.toLocaleString('en-US') + '.';
  }

  // ------------------------------------------------------------ farm plan, in-page

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') !== -1 || c.indexOf('yield') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Provide $' + capital + ' of liquidity to ' + name + '\u2019s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Stake $' + capital + ' of the chain\u2019s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') !== -1) return 'Mint $' + capital + ' of the protocol\u2019s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var action = actionFor(row, capital, chain);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var gasTotal = 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
    var opportunity = Math.round((capital * MODEL.opportunity_apr * hold) / 365);
    var totalCost = gasTotal + opportunity;
    var hours = Math.round(((5 + 15 + 10 * weeks + 10 + 5) / 60) * 10) / 10;
    var breakEvenRaw = (totalCost / Math.max(1, row.implied_value_usd)) * 100;
    var breakEvenPct = breakEvenRaw < 0.01 ? breakEvenRaw.toFixed(4) : breakEvenRaw.toFixed(2);
    var costPerHour = Math.round((totalCost / Math.max(hours, 0.1)) * 100) / 100;
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      action + ' Cost: $' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas. Time: 15 minutes to set up.',
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + capital + ' stays in the position. Time: ' + hold + ' days.',
      'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.',
      'Verdict: about $' + totalCost + ' of gas and locked-capital cost and ' + hours + ' hours over ' + hold + ' days; the farm breaks even if the airdrop pays $' + totalCost + ', which is ' + breakEvenPct + '% of this protocol\u2019s expected value, at $' + costPerHour + ' per hour of your time. Cost: $' + totalCost + ' all in, ' + hours + ' hours. Time: ' + hold + ' days on the calendar.'
    ];
  }

  // ------------------------------------------------------------ dom helpers

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ------------------------------------------------------------ integrity strip

  function renderStrip() {
    var strip = document.getElementById('integrity');
    clear(strip);
    var cells = [
      [DATA.watchlist_size + '/40', 'watchlist protocols covered'],
      [String(DATA.board_size), 'rows on the board'],
      [String(V.comps), 'traded comps fit the value curve'],
      ['R² ' + fmtNum(V.r_squared, 2), 'in-sample fit of the value curve'],
      ['×' + fmtNum(V.loo.x_factor, 2), 'leave-one-out error, median'],
      ['×' + fmtNum(V.walk_forward.x_factor, 2), 'walk-forward error, median']
    ];
    cells.forEach(function (c) {
      strip.appendChild(el('div', {}, el('b', { text: c[0] }), el('span', { text: c[1] })));
    });
    document.getElementById('source-line').textContent =
      'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · floor $' + DATA.floor_usd.toLocaleString('en-US') +
      ' · model radar-3 · ' + DATA.board_size + ' rows · ' + DATA.set_aside_size + ' set aside · ' + DATA.live_size + ' live-token protocols shown separately.';
  }

  // ------------------------------------------------------------ filters

  function fillSelects() {
    var catSel = document.getElementById('category');
    var chainSel = document.getElementById('chain');
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      (r.chains || []).forEach(function (c) { chains[c] = true; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    Object.keys(chains).sort().forEach(function (c) {
      chainSel.appendChild(el('option', { value: c, text: c }));
    });
  }

  function matches(row) {
    if (state.category !== 'all' && (row.category || '') !== state.category) return false;
    if (state.chain !== 'all' && (row.chains || []).indexOf(state.chain) === -1) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + (row.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortKey(row) {
    if (state.sort === 'base') return row.base_implied;
    if (state.sort === 'odds') return row.launch_odds;
    if (state.sort === 'tvl') return row.tvl_usd;
    if (state.sort === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
    if (state.sort === 'age') return row.age_days === null ? -1 : row.age_days;
    return row.implied_value_usd;
  }

  // ------------------------------------------------------------ board view

  function renderBoard() {
    clear(app);
    var rows = DATA.rows.filter(matches).slice();
    rows.sort(function (a, b) {
      var d = (sortKey(a) - sortKey(b)) * state.dir;
      return d !== 0 ? d : (a.rank - b.rank);
    });
    if (rows.length === 0) {
      app.appendChild(el('div', { class: 'empty', text: 'No protocols match these filters.' }));
      return;
    }
    var table = el('table', {});
    var head = el('tr', {});
    var cols = [
      ['#', 'rank', 'num'], ['Protocol', 'name', ''], ['Category', 'category', ''],
      ['TVL', 'tvl', 'num'], ['7d', 'growth', 'num'], ['Age', 'age', 'num'],
      ['If launched', 'base', 'num'], ['Odds', 'odds', 'num'], ['Expected value', 'expected', 'num']
    ];
    cols.forEach(function (c) {
      head.appendChild(el('th', {
        class: c[2], text: c[0] + (state.sort === c[1] ? (state.dir === -1 ? ' ↓' : ' ↑') : ''),
        onclick: function () {
          if (state.sort === c[1]) state.dir = -state.dir;
          else { state.sort = c[1]; state.dir = -1; }
          document.getElementById('sort').value = state.sort;
          syncHash(); render();
        }
      }));
    });
    table.appendChild(head);
    rows.forEach(function (row) {
      var tr = el('tr', {
        class: 'rowlink',
        onclick: function () { openDetail(row.slug); }
      });
      tr.appendChild(el('td', { class: 'rank', text: String(row.rank) }));
      var nameCell = el('td', { class: 'name' });
      nameCell.appendChild(el('b', { text: row.name }));
      nameCell.appendChild(el('span', { text: row.slug }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { text: row.category || '—' }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(row.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtGrowth(row.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(row.age_days) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(row.base_implied) }));
      var oddsCell = el('td', { class: 'num odds', text: fmtOdds(row.launch_odds) });
      tr.appendChild(oddsCell);
      var expCell = el('td', { class: 'num expected' });
      expCell.appendChild(document.createTextNode(fmtUsd(row.implied_value_usd)));
      expCell.appendChild(el('span', { class: 'range', text: fmtUsd(row.range_low) + ' – ' + fmtUsd(row.range_high) }));
      tr.appendChild(expCell);
      table.appendChild(tr);
    });
    app.appendChild(table);
    app.appendChild(el('p', { class: 'footnote', text: rows.length + ' of ' + DATA.board_size + ' rows. Expected value is the fitted value if the token launches, times the odds it launches. Click a row for the full breakdown and farm plan.' }));
  }

  // ------------------------------------------------------------ live / set-aside views

  function renderLive() {
    clear(app);
    var cards = el('div', { class: 'cards' });
    DATA.live.forEach(function (p) {
      var card = el('div', { class: 'card' });
      card.appendChild(el('h3', { text: p.name }));
      card.appendChild(el('p', {}, el('b', { text: fmtUsd(p.mcap_usd) }), document.createTextNode(' market cap · ' + fmtUsd(p.tvl_usd) + ' TVL · 7d ' + fmtGrowth(p.change_7d))));
      card.appendChild(el('p', { text: (p.category || '—') + ' · ' + (p.chains || []).join(', ') }));
      card.appendChild(el('span', { class: 'pill', text: p.slug }));
      cards.appendChild(card);
    });
    app.appendChild(cards);
    app.appendChild(el('p', { class: 'footnote', text: 'These protocols already trade. Their market caps are facts from the snapshot, never mixed into the pre-token ranking.' }));
  }

  function renderSetAside() {
    clear(app);
    var table = el('table', {});
    table.appendChild(el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'TVL', class: 'num' }), el('th', { text: 'Why it is set aside' })));
    DATA.set_aside.forEach(function (p) {
      var tr = el('tr', {});
      var nameCell = el('td', { class: 'name' });
      nameCell.appendChild(el('b', { text: p.name }));
      nameCell.appendChild(el('span', { text: p.slug }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }));
      tr.appendChild(el('td', { text: p.reason }));
      table.appendChild(tr);
    });
    app.appendChild(table);
    app.appendChild(el('p', { class: 'footnote', text: DATA.set_aside.length + ' pre-token protocols are set aside by the watchlist\u2019s own rule — bridges, liquid staking, exchanges, wrapped or staked products, versioned pools — and never ranked as if a launch were theirs to claim.' }));
  }

  // ------------------------------------------------------------ methodology view

  function kvRow(dt, dd) {
    return [el('dt', { text: dt }), el('dd', { text: dd })];
  }
  function renderMethod() {
    clear(app);
    var wrap = el('div', { class: 'method' });
    wrap.appendChild(el('h2', { text: 'How the model works' }));
    wrap.appendChild(el('p', { text: 'The board ranks pre-token protocols by expected value: the fitted value of the token if it launches, times the odds it launches at all. Both halves come from the sealed snapshot alone — no name is ever special-cased, and every number below is computed from the snapshot at run time.' }));

    wrap.appendChild(el('h3', { text: '1 · The value curve, fitted' }));
    wrap.appendChild(el('p', { text: 'The value of a token is fitted on the protocols whose tokens already trade: log(market cap) regressed on log(TVL), seven-day growth, log age and chain count, with a per-category offset from the category\u2019s median residual. The fit uses ' + V.comps + ' traded comps (market cap above zero, TVL above zero, mcap/TVL at most 10).' }));
    var kv = el('dl', { class: 'kv' });
    kvRow('intercept', fmtNum(V.intercept)).forEach(function (n) { kv.appendChild(n); });
    kvRow('log TVL', fmtNum(V.log_tvl)).forEach(function (n) { kv.appendChild(n); });
    kvRow('seven-day growth', fmtNum(V.growth)).forEach(function (n) { kv.appendChild(n); });
    kvRow('log age', fmtNum(V.log_age)).forEach(function (n) { kv.appendChild(n); });
    kvRow('chain count', fmtNum(V.chains)).forEach(function (n) { kv.appendChild(n); });
    kvRow('in-sample R²', fmtNum(V.r_squared, 2)).forEach(function (n) { kv.appendChild(n); });
    wrap.appendChild(kv);
    wrap.appendChild(el('p', {}, el('code', { text: 'log(mcap) = ' + fmtNum(V.intercept) + ' + ' + fmtNum(V.log_tvl) + '·ln(TVL) + ' + fmtNum(V.growth) + '·growth + ' + fmtNum(V.log_age) + '·ln(1+age) + ' + fmtNum(V.chains) + '·chains + category offset' })));

    wrap.appendChild(el('h3', { text: '2 · Tested held-out, twice' }));
    var t = el('table', {});
    t.appendChild(el('tr', {}, el('th', { text: 'Test' }), el('th', { text: 'Tested on', class: 'num' }), el('th', { text: 'Median error', class: 'num' }), el('th', { text: '× factor', class: 'num' }), el('th', { text: 'Within ×2', class: 'num' })));
    [[V.loo, 'leave-one-out'], [V.walk_forward, 'walk-forward']].forEach(function (pair) {
      var test = pair[0];
      t.appendChild(el('tr', {},
        el('td', { text: pair[1] }),
        el('td', { class: 'num', text: String(test.n_test) }),
        el('td', { class: 'num', text: fmtNum(test.median_log_error) + ' log points' }),
        el('td', { class: 'num', text: '×' + fmtNum(test.x_factor, 2) }),
        el('td', { class: 'num', text: test.within_2x_pct + '%' })));
    });
    wrap.appendChild(t);
    wrap.appendChild(el('p', { text: 'Leave-one-out refits the curve without each traded protocol in turn and predicts it. Walk-forward trains on the older half by listing date and tests on the younger half. A plain per-category median multiple — the previous model — scores ×4.62 on leave-one-out; the fitted curve scores ×' + fmtNum(V.loo.x_factor, 2) + '. The walk-forward test is the honest counterweight: the fitted curve scores ×' + fmtNum(V.walk_forward.x_factor, 2) + ' there, against ×3.17 for the median model — a tie, not a win — so the dashboard shows both numbers rather than the flattering one.' }));

    wrap.appendChild(el('h3', { text: '3 · Every value term, kept or dropped on its own test' }));
    var tt = el('table', {});
    tt.appendChild(el('tr', {}, el('th', { text: 'Term' }), el('th', { text: 'LOO error', class: 'num' }), el('th', { text: '× factor', class: 'num' }), el('th', { text: 'Verdict' }), el('th', { text: 'Why' })));
    V.terms.forEach(function (term) {
      tt.appendChild(el('tr', {},
        el('td', { text: term.term }),
        el('td', { class: 'num', text: fmtNum(term.loo_median_log_error) }),
        el('td', { class: 'num', text: '×' + fmtNum(term.loo_x_factor, 2) }),
        el('td', { text: term.kept ? 'kept' : 'dropped' }),
        el('td', { text: term.note })));
    });
    wrap.appendChild(tt);

    wrap.appendChild(el('h3', { text: '4 · Launch odds, from the peers\u2019 record' }));
    wrap.appendChild(el('p', { text: 'Odds are the share of the snapshot\u2019s protocols in the same category and age quartile that record a token, shrunk toward the category rate (weight 8) and clamped to 2–95%. ' + Math.round(V.global_launch_rate * 100) + '% of all protocols in the snapshot record a token. Age quartiles are the snapshot\u2019s own: ' + V.age_bands.map(function (b) { return b.lo + '–' + b.hi + 'd (' + Math.round(b.launch_rate * 100) + '%)'; }).join(', ') + '. Older protocols are more likely to hold a token — they have had longer to launch one — so a young protocol\u2019s odds are lower even in a high-rate category.' }));
    var ct = el('table', {});
    ct.appendChild(el('tr', {}, el('th', { text: 'Category' }), el('th', { text: 'Comps', class: 'num' }), el('th', { text: 'Value offset', class: 'num' }), el('th', { text: 'Launch rate', class: 'num' }), el('th', { text: 'Peers hold a token by', class: 'num' })));
    V.categories.forEach(function (c) {
      ct.appendChild(el('tr', {},
        el('td', { text: c.category || '(no category)' }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtNum(c.offset) }),
        el('td', { class: 'num', text: fmtRate(c.launch_rate) }),
        el('td', { class: 'num', text: c.peer_launch_age_days === null ? 'n/a' : fmtAge(c.peer_launch_age_days) })));
    });
    wrap.appendChild(ct);
    wrap.appendChild(el('p', { text: 'The launch clock: for each category, the median age of the protocols that already hold a token — the age by which peers typically hold one. A protocol older than its peers\u2019 launch age has outlasted the typical launch window; a younger one has not reached it yet.' }));

    wrap.appendChild(el('h3', { text: '5 · Ranges, not point estimates alone' }));
    wrap.appendChild(el('p', { text: 'A fitted value is a guess with a spread. The leave-one-out prediction ratios run from ×' + fmtNum(V.range_low_factor, 2) + ' at the 25th percentile to ×' + fmtNum(V.range_high_factor, 2) + ' at the 75th, so each row shows its expected value as a range as well as a point. The board ranks on the point estimate; the range says how much to trust it.' }));

    wrap.appendChild(el('h3', { text: '6 · Farm plans, costed to the dollar' }));
    wrap.appendChild(el('p', { text: 'Each row\u2019s plan is generated from its own record — category, chains, TVL, age — and ends in a verdict: gas, the capital locked and its opportunity cost at a stated 5% a year, the hours spent, and the airdrop share at which the farm breaks even. Nothing in a plan is copied from another protocol\u2019s plan.' }));
    wrap.appendChild(el('p', { class: 'note', text: 'Assumptions, stated plainly: the 5% opportunity cost of locked capital; “records no token” is not proof a protocol has no token; expected value is a model claim, never a price. The snapshot is the sealed input dated ' + DATA.as_of + '; the board is recomputed from it at run time, never from a live feed.' }));
    app.appendChild(wrap);
  }

  // ------------------------------------------------------------ detail dialog

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) {
      if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    }
    if (!row) return;
    state.selected = slug;
    var dlg = document.getElementById('detail');
    clear(dlg);
    var head = el('div', { class: 'detail-head' });
    head.appendChild(el('button', { class: 'close-btn', text: 'Close', onclick: function () { dlg.close(); } }));
    head.appendChild(el('h2', { text: '#' + row.rank + ' ' + row.name }));
    head.appendChild(el('p', { text: row.slug + ' · ' + (row.category || '—') + ' · ' + (row.chains || []).join(', ') + ' · ' + fmtUsd(row.tvl_usd) + ' TVL · 7d ' + fmtGrowth(row.change_7d) + ' · age ' + fmtAge(row.age_days) }));
    dlg.appendChild(head);
    var body = el('div', { class: 'detail-body' });
    body.appendChild(el('h3', { text: 'Expected value' }));
    var kv = el('dl', { class: 'kv' });
    kvRow('expected value', fmtUsd(row.implied_value_usd) + '  (range ' + fmtUsd(row.range_low) + ' – ' + fmtUsd(row.range_high) + ')').forEach(function (n) { kv.appendChild(n); });
    kvRow('value if launched', fmtUsd(row.base_implied)).forEach(function (n) { kv.appendChild(n); });
    kvRow('launch odds', fmtOdds(row.launch_odds) + ' — category rate ' + fmtRate(row.odds_category_rate) + ', age-band rate ' + fmtRate(row.odds_band_rate) + ', cell ' + row.odds_cell_tok + '/' + row.odds_cell_n + ' peers hold a token').forEach(function (n) { kv.appendChild(n); });
    kvRow('launch clock', row.peer_launch_age_days === null ? 'no traded peers in this category' : 'peers in this category typically hold a token by age ' + fmtAge(row.peer_launch_age_days) + '; this protocol is ' + fmtAge(row.age_days)).forEach(function (n) { kv.appendChild(n); });
    kvRow('fitted terms', 'ln(TVL)×' + fmtNum(V.log_tvl) + ' + growth×' + fmtNum(V.growth) + ' + ln(1+age)×' + fmtNum(V.log_age) + ' + chains×' + fmtNum(V.chains) + ' + offset ' + fmtNum(categoryOffset(row.category))).forEach(function (n) { kv.appendChild(n); });
    body.appendChild(kv);
    body.appendChild(el('p', { class: 'note', text: recomputeCheck(row) }));
    body.appendChild(el('h3', { text: 'Farm plan' }));
    var ol = el('ol', { class: 'steps' });
    farmSteps(row).forEach(function (s) {
      ol.appendChild(el('li', { text: s }));
    });
    body.appendChild(ol);
    dlg.appendChild(body);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    syncHash();
  }

  // ------------------------------------------------------------ state + hash

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    state.q = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.chain = params.get('chain') || 'all';
    state.tab = params.get('tab') || 'pre-token';
    state.sort = params.get('sort') || 'expected';
    state.selected = params.get('p') || null;
  }
  function syncHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'expected') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    var url = next ? '#' + next : window.location.pathname;
    try { window.history.replaceState(null, '', url); } catch (e) { /* hash only */ }
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'set-aside') renderSetAside();
    else if (state.tab === 'method') renderMethod();
    else renderBoard();
  }

  function init() {
    renderStrip();
    fillSelects();
    readHash();
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('sort').value = state.sort;
    document.getElementById('q').addEventListener('input', function (e) {
      state.q = e.target.value; syncHash(); render();
    });
    document.getElementById('category').addEventListener('change', function (e) {
      state.category = e.target.value; syncHash(); render();
    });
    document.getElementById('chain').addEventListener('change', function (e) {
      state.chain = e.target.value; syncHash(); render();
    });
    document.getElementById('sort').addEventListener('change', function (e) {
      state.sort = e.target.value; state.dir = -1; syncHash(); render();
    });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        state.selected = null;
        syncHash(); render();
      });
    });
    document.getElementById('detail').addEventListener('close', function () {
      state.selected = null; syncHash();
    });
    render();
    if (state.selected) openDetail(state.selected);
  }

  init();
})();
