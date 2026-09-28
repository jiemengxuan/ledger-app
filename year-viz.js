/* 个人记账本 · 今年一览（12 个月柱状图） */
(function () {
  'use strict';
  var React = (typeof window !== 'undefined' && window.React) || null;

  function money(n, fmt) {
    if (typeof fmt === 'function') return fmt(n);
    var x = Number(n) || 0;
    return '¥' + x.toFixed(2);
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function monthKey(year, m) {
    return year + '-' + pad(m);
  }

  function buildMonths(records, budgets, defaultBudget, year) {
    var now = new Date();
    var curY = now.getFullYear();
    var curM = now.getMonth() + 1;
    var list = [];
    var i, m, key, exp, inc, budget, recs;
    for (m = 1; m <= 12; m++) {
      key = monthKey(year, m);
      recs = (records || []).filter(function (r) { return r.date && r.date.indexOf(key) === 0; });
      exp = 0;
      inc = 0;
      for (i = 0; i < recs.length; i++) {
        if (recs[i].type === 'income') inc += recs[i].amount;
        else if (recs[i].type === 'expense') exp += recs[i].amount;
      }
      budget = 0;
      if (budgets && budgets[key] > 0) budget = budgets[key];
      else if (defaultBudget > 0) budget = defaultBudget;
      list.push({
        month: m,
        key: key,
        exp: exp,
        inc: inc,
        budget: budget,
        over: budget > 0 && exp > budget + 0.001,
        future: year > curY || (year === curY && m > curM)
      });
    }
    return list;
  }

  function topCategory(records, year) {
    var map = {};
    var prefix = String(year);
    (records || []).forEach(function (r) {
      if (r.type !== 'expense' || !(r.amount > 0) || !r.date || r.date.slice(0, 4) !== prefix) return;
      var k = r.category || '其他';
      map[k] = (map[k] || 0) + r.amount;
    });
    var best = null;
    Object.keys(map).forEach(function (k) {
      if (!best || map[k] > best.amount) best = { name: k, amount: map[k] };
    });
    return best;
  }

  function Bars(props) {
    var months = props.months || [];
    var format = props.format;
    var onPick = props.onPickMonth;
    var w = 320, h = 168, padL = 8, padR = 8, padT = 18, padB = 28;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    var max = 0;
    months.forEach(function (m) { if (m.exp > max) max = m.exp; });
    if (max <= 0) max = 1;
    else max = max * 1.08;
    var gap = 4;
    var bw = (innerW - gap * 11) / 12;
    var bars = months.map(function (m, i) {
      var bh = m.future ? 0 : (m.exp / max) * innerH;
      if (!m.future && m.exp <= 0) bh = 2;
      var x = padL + i * (bw + gap);
      var y = padT + innerH - bh;
      var cls = 'pl-yv-bar' + (m.over ? ' is-over' : '') + (m.future ? ' is-future' : '');
      return React.createElement('g', {
        key: m.key,
        className: cls,
        style: { cursor: m.future ? 'default' : 'pointer' },
        onClick: function () { if (!m.future && onPick) onPick(m.key); }
      },
        React.createElement('rect', {
          x: x, y: y, width: bw, height: Math.max(bh, 0), rx: 3
        }),
        React.createElement('text', {
          x: x + bw / 2, y: h - 8, textAnchor: 'middle', className: 'pl-yv-axis'
        }, m.month)
      );
    });
    return React.createElement('div', { className: 'pl-yv-chart' },
      React.createElement('svg', { className: 'pl-yv-svg', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMidYMid meet' }, bars),
      React.createElement('div', { className: 'pl-yv-keys' },
        React.createElement('span', { className: 'pl-yv-key' }, React.createElement('i', { className: 'ok' }), '支出'),
        React.createElement('span', { className: 'pl-yv-key' }, React.createElement('i', { className: 'over' }), '超预算')
      )
    );
  }

  function YearViz(props) {
    var records = (props && props.records) || [];
    var year = props && props.year;
    var format = props && props.format;
    var months = buildMonths(records, props && props.budgets, (props && props.defaultBudget) || 0, year);
    var exp = months.reduce(function (s, m) { return s + m.exp; }, 0);
    var inc = months.reduce(function (s, m) { return s + m.inc; }, 0);
    var top = topCategory(records, year);
    var overs = months.filter(function (m) { return m.over; }).map(function (m) { return m.month + '月'; });
    return React.createElement('div', { className: 'pl-yv' },
      React.createElement('div', { className: 'pl-dual' },
        React.createElement('div', { className: 'pl-dual-card' },
          React.createElement('div', { className: 'pl-dual-name' }, '今年支出'),
          React.createElement('div', { className: 'pl-dual-value', style: { color: 'var(--pl-danger)' } }, money(exp, format))
        ),
        React.createElement('div', { className: 'pl-dual-card' },
          React.createElement('div', { className: 'pl-dual-name' }, '今年收入'),
          React.createElement('div', { className: 'pl-dual-value', style: { color: 'var(--pl-green)' } }, money(inc, format))
        )
      ),
      React.createElement('div', { className: 'pl-yv-notes' },
        React.createElement('div', { className: 'pl-yv-note' },
          React.createElement('span', null, '花得最多'),
          React.createElement('strong', null, top ? top.name + ' · ' + money(top.amount, format) : '还没有支出')
        ),
        React.createElement('div', { className: 'pl-yv-note' },
          React.createElement('span', null, '超预算的月份'),
          React.createElement('strong', { className: overs.length ? 'is-over' : '' }, overs.length ? overs.join('、') : '各月都没超')
        )
      ),
      React.createElement('div', { className: 'pl-yv-caption' }, '点一根柱子，可看那个月的明细'),
      React.createElement(Bars, { months: months, format: format, onPickMonth: props && props.onPickMonth })
    );
  }

  if (typeof document !== 'undefined') {
    var styleEl = document.createElement('style');
    styleEl.textContent = [
      '.pl-yv{margin-top:4px}',
      '.pl-yv-notes{display:flex;flex-direction:column;gap:10px;margin:14px 0 8px}',
      '.pl-yv-note{display:flex;justify-content:space-between;align-items:baseline;gap:12px;color:var(--pl-muted);font-size:13px}',
      '.pl-yv-note strong{color:var(--pl-ink);font-weight:700;text-align:right}',
      '.pl-yv-note strong.is-over{color:var(--pl-danger)}',
      '.pl-yv-caption{color:var(--pl-muted);font-size:12px;margin:8px 0 6px}',
      '.pl-yv-chart{margin-top:4px}',
      '.pl-yv-svg{width:100%;height:auto;display:block}',
      '.pl-yv-bar rect{fill:var(--pl-green)}',
      '.pl-yv-bar.is-over rect{fill:var(--pl-danger)}',
      '.pl-yv-bar.is-future rect{fill:var(--pl-line)}',
      '.pl-yv-axis{fill:var(--pl-muted);font-size:10px}',
      '.pl-yv-keys{display:flex;gap:14px;margin-top:2px}',
      '.pl-yv-key{display:flex;align-items:center;gap:6px;color:var(--pl-muted);font-size:11px}',
      '.pl-yv-key i{width:10px;height:10px;border-radius:3px;display:inline-block}',
      '.pl-yv-key i.ok{background:var(--pl-green)}',
      '.pl-yv-key i.over{background:var(--pl-danger)}'
    ].join('');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  if (typeof window !== 'undefined') window.YearViz = YearViz;
})();
