/* 个人记账本 · 本月图景（分类饼图 + 每日走势） */
(function () {
  'use strict';
  var React = (typeof window !== 'undefined' && window.React) || null;
  var COLORS = ['#5b8def', '#3ecf8e', '#f5a524', '#f31260', '#9b6dff', '#17c3b2', '#ff7a59', '#7aa2f7'];

  function money(n, fmt) {
    if (typeof fmt === 'function') return fmt(n);
    var x = Number(n) || 0;
    return '¥' + x.toFixed(2);
  }

  function daysInMonth(ym) {
    var p = String(ym || '').split('-');
    if (p.length < 2) return 30;
    return new Date(+p[0], +p[1], 0).getDate();
  }

  function untilDay(ym) {
    var p = String(ym || '').split('-');
    var now = new Date();
    var last = daysInMonth(ym);
    if (+p[0] === now.getFullYear() && +p[1] === now.getMonth() + 1) return now.getDate();
    return last;
  }

  function byCategory(records) {
    var map = {};
    (records || []).forEach(function (r) {
      if (r.type !== 'expense' || !(r.amount > 0)) return;
      var k = r.category || '其他';
      map[k] = (map[k] || 0) + r.amount;
    });
    return Object.keys(map).map(function (name, i) {
      return { name: name, value: map[name], color: COLORS[i % COLORS.length] };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function dailySeries(records, ym) {
    var last = untilDay(ym);
    var exp = [], inc = [];
    var i;
    for (i = 1; i <= last; i++) { exp[i] = 0; inc[i] = 0; }
    (records || []).forEach(function (r) {
      if (!r.date || r.date.indexOf(ym) !== 0) return;
      var d = +r.date.slice(8, 10);
      if (d < 1 || d > last) return;
      if (r.type === 'income') inc[d] += r.amount;
      else exp[d] += r.amount;
    });
    return { last: last, exp: exp, inc: inc };
  }

  function Donut(props) {
    var slices = props.slices || [];
    var total = slices.reduce(function (s, x) { return s + x.value; }, 0);
    var r = 56, circ = 2 * Math.PI * r, offset = 0;
    var rings = slices.map(function (s, i) {
      var len = total > 0 ? (s.value / total) * circ : 0;
      var el = React.createElement('circle', {
        key: s.name + i,
        cx: 80, cy: 80, r: r,
        fill: 'none',
        stroke: s.color,
        strokeWidth: 22,
        strokeDasharray: len + ' ' + (circ - len),
        strokeDashoffset: -offset,
        transform: 'rotate(-90 80 80)'
      });
      offset += len;
      return el;
    });
    if (!slices.length) {
      rings = [React.createElement('circle', { key: 'empty', cx: 80, cy: 80, r: r, fill: 'none', stroke: 'var(--pl-line)', strokeWidth: 22 })];
    }
    return React.createElement('div', { className: 'pl-viz-pie' },
      React.createElement('svg', { className: 'pl-viz-svg', viewBox: '0 0 160 160', width: 148, height: 148 },
        React.createElement('circle', { cx: 80, cy: 80, r: 42, fill: 'var(--pl-card)' }),
        rings,
        React.createElement('text', { x: 80, y: 76, textAnchor: 'middle', className: 'pl-viz-center-label' }, '支出'),
        React.createElement('text', { x: 80, y: 96, textAnchor: 'middle', className: 'pl-viz-center-val' }, total > 0 ? money(total, props.format) : '—')
      ),
      React.createElement('div', { className: 'pl-viz-legend' },
        slices.length ? slices.map(function (s) {
          var pct = total > 0 ? Math.round(s.value / total * 100) : 0;
          return React.createElement('div', { key: s.name, className: 'pl-viz-leg' },
            React.createElement('span', { className: 'pl-viz-dot', style: { background: s.color } }),
            React.createElement('span', { className: 'pl-viz-leg-name' }, s.name),
            React.createElement('span', { className: 'pl-viz-leg-pct' }, pct + '%'),
            React.createElement('span', { className: 'pl-viz-leg-val' }, money(s.value, props.format))
          );
        }) : React.createElement('div', { className: 'pl-viz-empty' }, '这个月还没有支出，饼图在等第一笔账。')
      )
    );
  }

  function Line(props) {
    var s = dailySeries(props.records, props.month);
    var w = 320, h = 176, padL = 10, padR = 22, padT = 22, padB = 28;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    var max = 0, d;
    for (d = 1; d <= s.last; d++) {
      if (s.exp[d] > max) max = s.exp[d];
      if (s.inc[d] > max) max = s.inc[d];
    }
    if (max <= 0) max = 1;
    else max = max * 1.12;
    function xOf(day) { return padL + (s.last <= 1 ? innerW / 2 : (day - 1) / (s.last - 1) * innerW); }
    function yOf(v) { return padT + innerH - (v / max) * innerH; }
    function seriesPath(arr, close) {
      var pts = [], i;
      for (i = 1; i <= s.last; i++) pts.push(xOf(i).toFixed(1) + ',' + yOf(arr[i]).toFixed(1));
      if (!close) return 'M' + pts.join(' L');
      return 'M' + xOf(1).toFixed(1) + ',' + (padT + innerH).toFixed(1) + ' L' + pts.join(' L') + ' L' + xOf(s.last).toFixed(1) + ',' + (padT + innerH).toFixed(1) + ' Z';
    }
    var ticks = [1];
    if (s.last > 10) ticks.push(Math.round(s.last / 2));
    if (s.last > 1) ticks.push(s.last);
    var grids = [0, 0.5, 1].map(function (t, i) {
      var y = yOf(max * t);
      return React.createElement('line', { key: 'g' + i, x1: padL, x2: w - padR, y1: y, y2: y, className: 'pl-viz-grid' });
    });
    var hasExp = s.exp.some(function (v, i) { return i > 0 && v > 0; });
    var hasInc = s.inc.some(function (v, i) { return i > 0 && v > 0; });
    var dots = [];
    for (d = 1; d <= s.last; d++) {
      if (s.exp[d] > 0) dots.push(React.createElement('circle', { key: 'e' + d, cx: xOf(d), cy: yOf(s.exp[d]), r: 2.6, className: 'pl-viz-dot-exp' }));
      if (s.inc[d] > 0) dots.push(React.createElement('circle', { key: 'i' + d, cx: xOf(d), cy: yOf(s.inc[d]), r: 2.6, className: 'pl-viz-dot-inc' }));
    }
    return React.createElement('div', { className: 'pl-viz-line-wrap' },
      React.createElement('svg', { className: 'pl-viz-svg pl-viz-line', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMidYMid meet' },
        grids,
        hasExp ? React.createElement('path', { d: seriesPath(s.exp, true), className: 'pl-viz-area' }) : null,
        hasExp ? React.createElement('path', { d: seriesPath(s.exp, false), className: 'pl-viz-stroke-exp', fill: 'none' }) : null,
        hasInc ? React.createElement('path', { d: seriesPath(s.inc, false), className: 'pl-viz-stroke-inc', fill: 'none' }) : null,
        dots,
        ticks.map(function (t) {
          return React.createElement('text', { key: 't' + t, x: xOf(t), y: h - 8, textAnchor: 'middle', className: 'pl-viz-axis' }, t + '日');
        })
      ),
      React.createElement('div', { className: 'pl-viz-keys' },
        React.createElement('span', { className: 'pl-viz-key' }, React.createElement('i', { className: 'exp' }), '支出'),
        React.createElement('span', { className: 'pl-viz-key' }, React.createElement('i', { className: 'inc' }), '收入')
      ),
      !hasExp && !hasInc ? React.createElement('div', { className: 'pl-viz-empty' }, '这个月还没有流水，折线在等第一笔账。') : null
    );
  }

  function MonthViz(props) {
    var records = (props && props.records) || [];
    var month = (props && props.month) || '';
    var format = props && props.format;
    var page = !!(props && props.page);
    var st = React.useState({ open: page, tab: 'pie' });
    var state = st[0];
    var set = function (patch) {
      st[1](function (s) {
        var o = {};
        for (var k in s) o[k] = s[k];
        for (var k2 in patch) o[k2] = patch[k2];
        return o;
      });
    };
    var slices = byCategory(records);
    var body = React.createElement('div', { className: 'pl-viz-body' },
      React.createElement('div', { className: 'pl-viz-tabs' },
        React.createElement('button', { type: 'button', className: state.tab === 'pie' ? 'active' : '', onClick: function (e) { e.stopPropagation(); set({ tab: 'pie' }); } }, '分类'),
        React.createElement('button', { type: 'button', className: state.tab === 'line' ? 'active' : '', onClick: function (e) { e.stopPropagation(); set({ tab: 'line' }); } }, '走势')
      ),
      state.tab === 'pie'
        ? React.createElement(Donut, { slices: slices, format: format })
        : React.createElement(Line, { records: records, month: month, format: format })
    );
    if (page) {
      return React.createElement('div', { className: 'pl-main-card pl-viz-card is-page' }, body);
    }
    return React.createElement('div', { className: 'pl-main-card pl-viz-card' },
      React.createElement('div', {
        className: 'pl-section-head pl-fold-head' + (state.open ? ' is-open' : ''),
        role: 'button',
        onClick: function () { set({ open: !state.open }); }
      },
        React.createElement('div', { className: 'pl-section-title' }, '本月图景'),
        React.createElement('span', { className: 'pl-pill' }, state.open ? '收起' : '展开')
      ),
      state.open ? body : null
    );
  }

  if (typeof document !== 'undefined') {
    var styleEl = document.createElement('style');
    styleEl.textContent = [
      '.pl-viz-body{margin-top:2px}',
      '.pl-viz-tabs{display:inline-flex;gap:0;padding:3px;margin-bottom:14px;border-radius:999px;background:var(--pl-input-bg);border:1px solid var(--pl-line)}',
      '.pl-viz-tabs button{border:0;background:transparent;color:var(--pl-muted);height:28px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}',
      '.pl-viz-tabs button.active{background:var(--pl-green);color:#000}',
      '.pl-viz-pie{display:flex;align-items:center;gap:16px}',
      '.pl-viz-svg{display:block;flex-shrink:0}',
      '.pl-viz-center-label{fill:var(--pl-muted);font-size:11px}',
      '.pl-viz-center-val{fill:var(--pl-ink);font-size:11px;font-weight:700}',
      '.pl-viz-legend{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}',
      '.pl-viz-leg{display:grid;grid-template-columns:10px 1fr auto auto;align-items:center;gap:8px;font-size:12px}',
      '.pl-viz-dot{width:8px;height:8px;border-radius:50%;display:inline-block}',
      '.pl-viz-leg-name{color:var(--pl-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pl-viz-leg-pct{color:var(--pl-muted);font-variant-numeric:tabular-nums}',
      '.pl-viz-leg-val{color:var(--pl-ink);font-variant-numeric:tabular-nums;font-weight:600}',
      '.pl-viz-empty{color:var(--pl-muted);font-size:12px;line-height:1.55;padding:8px 0}',
      '.pl-viz-line-wrap{position:relative}',
      '.pl-viz-line{width:100%;height:auto}',
      '.pl-viz-grid{stroke:var(--pl-line);stroke-width:1}',
      '.pl-viz-area{fill:var(--pl-green);opacity:.16}',
      '.pl-viz-stroke-exp{stroke:var(--pl-green);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
      '.pl-viz-stroke-inc{stroke:#5b8def;stroke-width:2;stroke-dasharray:4 4;stroke-linecap:round;stroke-linejoin:round}',
      '.pl-viz-dot-exp{fill:var(--pl-green)}',
      '.pl-viz-dot-inc{fill:#5b8def}',
      '.pl-viz-axis{fill:var(--pl-muted);font-size:10px}',
      '.pl-viz-keys{display:flex;gap:14px;margin-top:4px}',
      '.pl-viz-key{display:flex;align-items:center;gap:6px;color:var(--pl-muted);font-size:11px}',
      '.pl-viz-key i{width:14px;height:2px;border-radius:2px;display:inline-block}',
      '.pl-viz-key i.exp{background:var(--pl-green)}',
      '.pl-viz-key i.inc{background:#5b8def}',
      '@media (max-width:420px){.pl-viz-pie{flex-direction:column;align-items:stretch}.pl-viz-svg{margin:0 auto}}'
    ].join('');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  if (typeof window !== 'undefined') window.MonthViz = MonthViz;
})();
