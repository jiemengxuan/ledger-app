/* 个人记账本 · 一句话记账（规则引擎 + 一键入账）
 * 独立文件：解析引擎 + React 组件，不修改原有记账逻辑。
 * 数据：window.SmartLedgerCard 为注入到「记一笔」页面的 React 组件。
 */
(function () {
  'use strict';
  var React = (typeof window !== 'undefined' && window.React) || null;

  /* ================= 规则引擎 ================= */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function shiftISO(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* 上月/下月同一天（自动钳制到当月天数） */
  function shiftMonth(offset) {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(now.getDate(), lastDay));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  var CN_UNITS = { '十': 10, '百': 100, '千': 1000, '万': 10000 };

  /* 中文数字 → 数字：三十五=35、一百二十=120、一万二=12000、两千五=2500 */
  function cn2num(s) {
    if (!s || !/^[零〇一二两三四五六七八九十百千万]+$/.test(s)) return NaN;
    // 口语省略：X百Y / X千Y / X万Y（如"一百二"=120、"两千五"=2500）
    var m = s.match(/^([一二两三四五六七八九])?([百千万])([一二三四五六七八九])$/);
    if (m) {
      var unit = CN_UNITS[m[2]];
      return (m[1] ? CN_DIGITS[m[1]] : 1) * unit + CN_DIGITS[m[3]] * (unit / 10);
    }
    var total = 0, section = 0, num = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (CN_DIGITS[ch] !== undefined) { num = CN_DIGITS[ch]; }
      else if (CN_UNITS[ch]) {
        var u = CN_UNITS[ch];
        if (u === 10000) { total += (section + (num || 1)) * u; section = 0; num = 0; }
        else { section += (num || 1) * u; num = 0; }
      } else { return NaN; }
    }
    return total + section + num;
  }

  function ymd(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    var last = new Date(year, month, 0).getDate();
    if (day > last) return '';
    return year + '-' + pad(month) + '-' + pad(day);
  }

  /* 提取日期：今天/昨天/周X/X月X号/9.16/2026-9-21 → YYYY-MM-DD，并从文本移除 */
  function extractDate(text) {
    var t = String(text || '');
    var result = todayISO();
    var matched = '';
    var now = new Date();
    var m;

    // 1. 具体日期 2026-9-21 / 2026/9/21 / 2026.9.21 / 2026年9月21日
    m = t.match(/(20\d{2})[年\-\/\.](\d{1,2})[月\-\/\.](\d{1,2})日?/);
    if (m) {
      result = m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
      matched = m[0];
    } else {
      // 2. X月X号 / X月X日
      m = t.match(/(\d{1,2})月(\d{1,2})[号日]?/);
      if (m) {
        var iso2 = ymd(now.getFullYear(), +m[1], +m[2]);
        if (iso2) { result = iso2; matched = m[0]; }
      }
      if (!matched) {
        // 2b. 9.16 / 9/16 / 9-16（口语缩写；排除 9.16元、1.5万）
        m = t.match(/(^|[^\d.．])(\d{1,2})[\.．\/\-](\d{1,2})(?:[号日])?(?!\d)(?!\s*(?:元|块钱|块|毛|角|分|万|千|百|[kKwW]|折))/);
        if (m) {
          var isoDot = ymd(now.getFullYear(), +m[2], +m[3]);
          if (isoDot) { result = isoDot; matched = m[0].slice(m[1].length); }
        }
      }
      if (!matched) {
        // 3. X号 / X日（本月；排除"35块"这类金额后缀）
        m = t.match(/(\d{1,2})[号日](?!\s*(?:元|块|钱|毛|角|分))/);
        if (m) {
          result = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(+m[1]);
          matched = m[0];
        } else {
          // 4. 月份词：上个月/这个月/下个月
          var mm = t.match(/(上|这|本|下)(?:个)?月/);
          if (mm) {
            result = shiftMonth(mm[1] === '上' ? -1 : (mm[1] === '下' ? 1 : 0));
            matched = mm[0];
          } else {
            // 5. 相对词
            var rel = [
              [/大前天/g, -3], [/前天/g, -2], [/昨天|昨日|昨儿/g, -1],
              [/今天|今日|今儿|当天/g, 0], [/明天|明日/g, 1], [/后天/g, 2], [/大后天/g, 3]
            ];
            for (var i = 0; i < rel.length; i++) {
              var rm = t.match(rel[i][0]);
              if (rm) { result = shiftISO(rel[i][1]); matched = rm[0]; break; }
            }
            if (!matched) {
              // 6. 周X / 星期X / 礼拜X（默认本周，已过则回上周；上X则再减一周）
              var weekMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
              m = t.match(/(上|这|本|下)?(?:周|星期|礼拜)([一二三四五六日天])/);
              if (m) {
                var curDay = now.getDay() === 0 ? 7 : now.getDay();
                var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                base.setDate(base.getDate() + (weekMap[m[2]] - curDay));
                if (m[1] === '上') base.setDate(base.getDate() - 7);
                result = base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
                matched = m[0];
              }
            }
          }
        }
      }
    }
    if (matched) t = t.replace(matched, ' ');
    return { date: result, cleaned: t, found: !!matched, matched: matched || '' };
  }

  var MONEY_UNITS = { '万': 10000, '千': 1000, '百': 100, '元': 1, '块钱': 1, '块': 1, '毛': 0.1, '角': 0.1, '分': 0.01, 'k': 1000, 'K': 1000, 'w': 10000, 'W': 10000 };
  var CN_CHARS = '[零〇一二两三四五六七八九十百千万]';
  var NON_CN = '[^0-9零〇一二两三四五六七八九十百千万]';

  /* 提取金额：返回 {amount, cleaned, found}，支持"35块""100元""1万2""一百二""35块6""打车35" */
  function extractAmount(text) {
    var t = String(text || '');
    var cands = [];
    var m;

    // A. 元角口语：35块6 / 35块6毛
    var reA = /([0-9]+(?:\.[0-9]+)?)\s*块\s*(?:([零一二三四五六七八九]|[0-9])\s*(?:毛|角)?)?/g;
    while ((m = reA.exec(t))) { cands.push({ v: parseFloat(m[1]) + (m[2] ? (CN_DIGITS[m[2]] !== undefined ? CN_DIGITS[m[2]] : parseFloat(m[2])) * 0.1 : 0), i: m.index, l: m[0].length, raw: m[0] }); }

    // B. 混合数：1万2 / 2千5
    var reB = /([0-9]+(?:\.[0-9]+)?)\s*(万|千)\s*([0-9]+)/g;
    while ((m = reB.exec(t))) {
      var bv = parseFloat(m[1]) * 10000 + (m[2] === '千' ? parseFloat(m[3]) * 100 : parseFloat(m[3]) * 1000);
      cands.push({ v: bv, i: m.index, l: m[0].length, raw: m[0] });
    }

    // C. 阿拉伯数字 + 单位
    var reC = /([0-9]+(?:\.[0-9]+)?)\s*(万|千|百|元|块钱|块|毛|角|分|k|K|w|W)/g;
    while ((m = reC.exec(t))) { cands.push({ v: parseFloat(m[1]) * MONEY_UNITS[m[2]], i: m.index, l: m[0].length, raw: m[0] }); }

    // D. 中文数字（含单位；单字无单位不认，避免"两张""三个"误判；后跟"多"为约数不认）
    var reD = new RegExp('([' + '零〇一二两三四五六七八九' + '十百千万]+)\\s*(万|千|百|元|块钱|块|毛|角|分)?', 'g');
    while ((m = reD.exec(t))) {
      var n = cn2num(m[1]);
      if (!isFinite(n)) continue;
      if (!m[2] && m[1].length < 2) continue;
      if (t.charAt(m.index + m[0].length) === '多') continue;
      cands.push({ v: n * (m[2] ? MONEY_UNITS[m[2]] : 1), i: m.index, l: m[0].length, raw: m[0] });
    }

    // E. 动作词后的裸数字：花了35 / 吃饭35 / 买了个手机6500 / 报销500（raw 只取数字，保留分类词）
    var reE = new RegExp('(?:花了|花|付了|付|用了|用|消费|支出|充值|充|缴|交|还|转|收|赚|买|吃|请客|打车|加油|下馆子|购物|报销|退款|到账|工资|房租|发|张|收到|收了|个|份|奖金|补贴|分红|利息|红包|收入)(?:了|过|的)?' + NON_CN + '{0,4}?([0-9]+(?:\\.[0-9]+)?)', 'g');
    while ((m = reE.exec(t))) {
      var numStart = m.index + (m[0].length - m[1].length);
      cands.push({ v: parseFloat(m[1]), i: numStart, l: m[1].length, raw: m[1] });
    }

    // F. 句末裸数字：去ktv300 / 唱歌200 / 去ktv 300元
    if (!cands.length) {
      m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:元|块钱|块)?$/);
      if (m && parseFloat(m[1]) > 0) {
        cands.push({ v: parseFloat(m[1]), i: m.index, l: m[0].length, raw: m[0] });
      }
    }

    if (!cands.length) return { amount: 0, cleaned: t, found: false };

    // 取"结束位置最靠后"的候选；结束位置相同时取金额更大者（覆盖"35块6"与"35块"重叠）
    cands.sort(function (a, b) {
      var d = (b.i + b.l) - (a.i + a.l);
      if (d !== 0) return d;
      return b.v - a.v;
    });
    var best = cands[0];
    var cleaned = t.slice(0, best.i) + ' ' + t.slice(best.i + best.l);
    return { amount: Math.round(best.v * 100) / 100, cleaned: cleaned, found: true };
  }

  /* 收支判定：先处理红包特例，再按强信号词判定，默认支出。explicit=本句是否有明确收支信号 */
  function detectType(text) {
    var t = String(text || '');
    if (/收红包|抢红包|领红包|收到红包|中了/.test(t)) return { type: 'income', explicit: true };
    if (/发红包|包红包|派红包|随礼/.test(t)) return { type: 'expense', explicit: true };
    var inc = /工资|薪水|薪资|收|赚|卖|退款|报销|奖金|兼职|转入|入账|理财|利息|补贴|佣金|返现|红包/.test(t);
    var exp = /花|付|买|吃|喝|打车|加油|充|缴|交|还|请客|下馆子|消费|购物|转账|支付/.test(t);
    return { type: exp && !inc ? 'expense' : (inc && !exp ? 'income' : 'expense'), explicit: !!(inc || exp) };
  }

  var EXP_RULES = {
    '餐饮': ['下馆子', '外卖', '食堂', '早餐', '午餐', '晚餐', '夜宵', '奶茶', '咖啡', '火锅', '烧烤', '零食', '水果', '请客', '聚餐', '吃饭', '包子', '面条', '拉面', '面馆', '拌面', '汤面', '炒面', '牛肉面', '泡面', '方便面', '小面', '饺子', '小吃', '点心', '快餐', '吃', '喝', '饭', '餐'],
    '交通': ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路', '出租', '油费', '骑车', '共享单车', '通行'],
    '医疗': ['买药', '医院', '看病', '挂号', '体检', '诊所', '牙', '药'],
    '住房': ['房租', '水费', '电费', '燃气', '煤气', '物业', '宽带', '网费', '房贷', '月供', '维修', '水电'],
    '娱乐': [
    '音乐节', '演唱会', '话剧', '音乐剧', '脱口秀', '相声', '演出', '球赛', '体育赛事', '门票',
    '网吧', '网咖', 'KTV', 'ktv', '练歌房', '量贩', '唱K', '开麦', 'karaoke', '酒吧', '夜店', '清吧', '迪吧', '棋牌室', '麻将',
    '剧本杀', '密室逃脱', '狼人杀', '桌游', '台球', '保龄球', '射箭', '射击', '卡丁车',
    '游乐园', '游乐场', '欢乐谷', '迪士尼', '水上乐园', '主题乐园', '动物园', '植物园', '海洋馆',
    '展览', '美术馆', '博物馆', '科技馆',
    '洗浴', '桑拿', '温泉', '泡澡', '按摩', '足浴', '足疗', '采耳', 'SPA', 'spa',
    '健身', '健身房', '瑜伽', '舞蹈', '游泳', '滑雪', '滑冰', '攀岩', '冲浪', '潜水', '钓鱼', '露营', '野餐',
    '游戏充值', '手游', '抽卡', '月卡', '点卡', 'Steam', 'steam', 'Switch', 'switch', 'PS5', 'ps5', '游戏',
    '视频会员', '爱奇艺', '优酷', '腾讯视频', 'B站', 'b站', '网易云', 'QQ音乐', 'Spotify', 'spotify', 'Netflix',
    '会员', '视频', '直播打赏',
    '旅游', '旅行', '酒店', '民宿', '住宿',
    '电影', '唱歌', '彩票', '刮刮乐', '写真', '摄影', '娱乐'
  ],
    '日用': ['超市', '日用', '纸巾', '洗衣', '洗漱', '洗面奶', '洁面', '面膜', '护肤', '水乳', '精华', '牙膏', '牙刷', '洗头', '洗发', '沐浴', '理发', '生活用品', '日用品'],
    '购物': ['淘宝', '京东', '拼多多', '衣服', '鞋', '包包', '化妆品', '网购', '快递', '商场', '买', '购物'],
    '其他': []
  };
  var INC_RULES = {
    '工资': ['工资', '薪水', '薪资', '月薪', '年薪', '发工资'],
    '兼职': ['兼职', '外快', '零工', '副业', '跑腿', '代课'],
    '红包': ['红包', '礼金', '压岁钱', '份子钱'],
    '其他': ['利息', '理财', '收益', '退款', '报销', '奖金', '补贴', '佣金', '卖', '赚', '入账', '返现']
  };
  var EXP_ORDER = ['医疗', '住房', '交通', '餐饮', '娱乐', '日用', '购物', '其他'];
  var INC_ORDER = ['工资', '兼职', '红包', '其他'];

  /* 分类映射：最长关键词优先，英文不区分大小写；命中分类必须存在于当前分类表，否则回退「其他」 */
  function detectCategory(text, type, cats) {
    var rules = type === 'income' ? INC_RULES : EXP_RULES;
    var order = type === 'income' ? INC_ORDER : EXP_ORDER;
    var hay = String(text || '').toLowerCase();
    var bestCat = '', bestLen = 0;
    for (var oi = 0; oi < order.length; oi++) {
      var cat = order[oi];
      var kws = rules[cat];
      for (var ki = 0; ki < kws.length; ki++) {
        var kw = kws[ki];
        if (kw && hay.indexOf(String(kw).toLowerCase()) >= 0 && kw.length > bestLen) { bestLen = kw.length; bestCat = cat; }
      }
    }
    if (bestCat && cats.indexOf(bestCat) >= 0) return bestCat;
    if (cats.indexOf('其他') >= 0) return '其他';
    return '';
  }

  /* 备注清理：去掉标点与无意义词，保留有信息量的语义词 */
  function cleanNote(text) {
    var t = String(text || '');
    t = t.replace(/[，,。.、;；!！?？:：'‘’"“”\s]+/g, ' ').trim();
    t = t.replace(/^(今日|今天|昨天|前天|明天|本周|上周|上个月|这个月|本月)\s*/g, '');
    // 前缀清理循环（处理"收到工资"→"到工资"这类连续词）
    for (var k = 0; k < 5; k++) {
      var n2 = t.replace(/^(花了|花|付了|付|用了|用|支付|消费|支出|一共|共计|总共|合计|还有|又|然后|并且|以及|的|买了|买|吃了|吃|喝了|喝|交了|交|充了|充|还了|还|转了|转|收了|收到|收|赚了|赚|给了|给|帮了|帮|我|我们|是|就|再|发|到账|到|到了|个|杯|两张|三张|两个)\s*/g, '');
      if (n2 === t) break;
      t = n2;
    }
    t = t.replace(/(花了|付了|用了|支付|一共|共计|总共|合计|的|到账|入账|转账|发红包|红包|吃了)$/g, '');
    t = t.replace(/^(房租|工资|薪水|话费|水电|电费|水费|餐费|油费|打车|吃饭|奶茶|药|电影|电影票|超市|下馆子|报销)$/g, '');
    return t;
  }

  /* 一句话 → 记账字段。ok=true 表示金额+分类都识别到，可一键入账 */
  function parseLedgerText(raw, expenseCats, incomeCats) {
    var cats = Array.isArray(expenseCats) ? expenseCats : [];
    var inc = Array.isArray(incomeCats) ? incomeCats : [];
    var text = String(raw || '').trim();
    var out = { type: 'expense', amount: 0, category: '', date: todayISO(), note: '', ok: false, missing: [] };
    if (!text) { out.missing = ['金额', '分类']; return out; }

    var d = extractDate(text);
    out.date = d.date;
    out.dateFound = d.found;
    text = d.cleaned;

    var ty = detectType(text);
    out.type = ty.type;
    out.typeExplicit = ty.explicit;

    var a = extractAmount(text);
    out.amount = a.amount;
    text = a.cleaned;

    out.category = detectCategory(text, out.type, out.type === 'income' ? inc : cats);
    out.note = cleanNote(text);

    if (!(out.amount > 0)) out.missing.push('金额');
    if (!out.category) out.missing.push('分类');
    out.ok = out.amount > 0 && !!out.category;
    return out;
  }

  /* 无标点时按「多个金额」切开：如「打台球50吃饭50」→「打台球50」「吃饭50」 */
  function splitMergedAmounts(text) {
    var original = String(text || '').trim();
    if (!original) return [];
    var d = extractDate(original);
    var t = String(d.cleaned || '').replace(/\s+/g, '').trim();
    if (!t) return [original];

    // 金额片段：35 / 35.5 / 35元 / 35块 / 35块6
    var re = /\d+(?:\.\d+)?(?:元|块钱|块(?:\d(?:\.\d+)?)?|毛|角|分|[kKwW]|万|千|百)?/g;
    var matches = [];
    var m;
    while ((m = re.exec(t))) {
      matches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (matches.length <= 1) return [original];

    var chunks = [];
    var prev = 0;
    for (var i = 0; i < matches.length; i++) {
      var chunk = t.slice(prev, matches[i].end).trim();
      // 金额前没有说明文字则并入上一段（避免误拆）
      var amtLen = matches[i].end - matches[i].start;
      var head = chunk.slice(0, Math.max(0, chunk.length - amtLen));
      if ((!head || !/[\u4e00-\u9fffA-Za-z]/.test(head)) && chunks.length) {
        chunks[chunks.length - 1] += chunk;
      } else if (chunk) {
        chunks.push(chunk);
      }
      prev = matches[i].end;
    }
    if (!chunks.length) return [original];

    // 把抽走的日期词补回第一段，方便后面日期继承
    if (d.found && d.matched) chunks[0] = d.matched + chunks[0];
    return chunks;
  }

  /* 多句拆分：先按标点拆，再对无标点粘连的多笔按金额切开 */
  function splitClauses(raw) {
    var t = String(raw || '').trim();
    if (!t) return [];
    var parts = t.split(/[，,、；;。\n\r]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    if (!parts.length) parts = [t];
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var sub = splitMergedAmounts(parts[i]);
      for (var j = 0; j < sub.length; j++) out.push(sub[j]);
    }
    return out.length ? out : [t];
  }

  /* 一句话多笔：逐句解析，日期/类型向前继承（如"昨天吃饭100，打车20"两句都是昨天、支出） */
  function parseMulti(raw, expenseCats, incomeCats) {
    var clauses = splitClauses(raw);
    var lastDate = null, lastType = 'expense';
    var items = [], skipped = 0;
    for (var i = 0; i < clauses.length; i++) {
      var c = parseLedgerText(clauses[i], expenseCats, incomeCats);
      if (c.dateFound) { lastDate = c.date; } else { c.date = lastDate || c.date; }
      if (c.typeExplicit) { lastType = c.type; } else { c.type = lastType; }
      if (c.amount > 0 && c.category) {
        items.push(c);
      } else if (clauses[i].trim().length > 0) {
        skipped++;
      }
    }
    return { items: items, skipped: skipped, total: clauses.length };
  }

  /* ================= 样式（跟随现有暗/浅主题变量） ================= */
  if (typeof document !== 'undefined') {
    var styleEl = document.createElement('style');
    styleEl.textContent = [
      '.pl-smart-card{margin:14px 18px 0;padding:16px;border-radius:20px;background:var(--pl-card);border:1px solid var(--pl-line);}',
      '.pl-smart-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.pl-smart-title{font-size:15px;font-weight:700;color:var(--pl-ink);}',
      '.pl-smart-mic{width:32px;height:32px;flex-shrink:0;border-radius:50%;border:1px solid var(--pl-line);background:var(--pl-icon-bg);color:var(--pl-muted-2);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}',
      '.pl-smart-mic.on{color:var(--pl-green);border-color:var(--pl-green);}',
      '.pl-smart-sub{font-size:12px;color:var(--pl-muted);margin:6px 0 10px;line-height:1.5;}',
      '.pl-smart-row{display:flex;gap:8px;margin-top:12px;}',
      '.pl-smart-input{flex:1;min-width:0;height:42px;border-radius:12px;border:1px solid var(--pl-line);background:var(--pl-input-bg);color:var(--pl-ink);padding:0 12px;font-size:14px;outline:none;font-family:inherit;}',
      '.pl-smart-input:focus{border-color:var(--pl-green);}',
      '.pl-smart-go{flex-shrink:0;height:42px;padding:0 14px;border-radius:12px;border:0;background:var(--pl-green);color:#000;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}',
      '.pl-smart-warn{margin-top:10px;font-size:12px;color:var(--pl-warn);line-height:1.5;}',
      '.pl-smart-confirm{margin-top:12px;border-radius:14px;border:1px solid var(--pl-green);padding:12px;position:relative;overflow:hidden;}',
      '.pl-smart-confirm::before{content:"";position:absolute;inset:0;background:var(--pl-fill-from);opacity:.1;pointer-events:none;}',
      '.pl-smart-confirm>*{position:relative;}',
      '.pl-smart-confirm-list{display:flex;flex-direction:column;gap:8px;}',
      '.pl-smart-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--pl-line);border-radius:10px;background:var(--pl-input-bg);}',
      '.pl-smart-item.off{opacity:.45;}',
      '.pl-smart-item.allrow{border-style:dashed;background:transparent;}',
      '.pl-smart-check{width:16px;height:16px;flex-shrink:0;accent-color:var(--pl-green);}',
      '.pl-smart-alllabel{font-size:12px;color:var(--pl-muted);}',
      '.pl-date-group-row td{padding:6px 12px;font-size:12px;font-weight:600;color:var(--pl-muted);background:var(--pl-input-bg);border-bottom:1px solid var(--pl-line);}',
      '.pl-smart-item .pl-smart-type,.pl-smart-item .pl-smart-cat,.pl-smart-item .pl-smart-meta{flex-shrink:0;}',
      '.pl-smart-type{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid currentColor;font-weight:600;}',
      '.pl-smart-type.exp{color:var(--pl-danger);}',
      '.pl-smart-type.inc{color:var(--pl-green);}',
      '.pl-smart-amount{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--pl-ink);}',
      '.pl-smart-cat{padding:2px 8px;border-radius:999px;background:var(--pl-icon-bg);color:var(--pl-muted);font-size:12px;}',
      '.pl-smart-meta{font-size:12px;color:var(--pl-muted);}',
      '.pl-smart-note{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--pl-muted);}',
      '.pl-smart-confirm-actions{display:flex;gap:8px;margin-top:10px;}',
      '.pl-smart-cancel{flex:1;height:40px;border-radius:12px;border:1px solid var(--pl-line);background:transparent;color:var(--pl-muted);font-size:14px;cursor:pointer;font-family:inherit;}',
      '.pl-smart-commit{flex:2;height:40px;border-radius:12px;border:0;background:var(--pl-green);color:#000;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ================= React 组件 ================= */
  var mic = null;
  var SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function SmartLedgerCard(props) {
    var expenseCats = (props && props.expenseCategories) || [];
    var incomeCats = (props && props.incomeCategories) || [];
    var onCommit = props && props.onCommit;
    var onFillForm = props && props.onFillForm;
    var title = '一语入账';

    var st = React.useState({ text: '', result: null, warn: '', recording: false });
    var state = st[0];
    var set = function (patch) {
      st[1](function (s) { var o = {}; for (var k in s) o[k] = s[k]; for (var k2 in patch) o[k2] = patch[k2]; return o; });
    };

    function recognize() {
      var txt = (state.text || '').trim();
      if (!txt) { set({ warn: '先输入一句话，比如：今天下馆子花了100元' }); return; }
      var r = parseMulti(txt, expenseCats, incomeCats);
      if (r.items.length === 0) {
        var one = parseLedgerText(txt, expenseCats, incomeCats);
        if (onFillForm) {
          onFillForm({ type: one.type, amount: one.amount, category: one.category, date: one.date, note: one.note });
        }
        var got = [];
        if (one.amount > 0) got.push('金额 ' + one.amount);
        if (one.category) got.push('分类「' + one.category + '」');
        set({
          result: null,
          warn: '还缺：' + one.missing.join('、') + (got.length ? '（已识别：' + got.join('、') + '）' : '') + '。已填入下方表单，补全后点「保存」。'
        });
        return;
      }
      r.items.forEach(function (it) { it.checked = true; });
      set({
        result: r,
        warn: r.skipped > 0 ? (r.skipped + ' 句没识别出金额或分类，未列入；如需记录请在下方表单手动补一笔。') : ''
      });
    }

    function toggleItem(idx, checked) {
      var list = (state.result && state.result.items) ? state.result.items.slice() : [];
      if (!list[idx]) return;
      list[idx] = Object.assign({}, list[idx], { checked: checked });
      set({ result: Object.assign({}, state.result, { items: list }) });
    }

    function toggleAll() {
      var list = (state.result && state.result.items) ? state.result.items : [];
      if (!list.length) return;
      var allOn = list.every(function (it) { return it.checked; });
      var next = list.map(function (it) { return Object.assign({}, it, { checked: !allOn }); });
      set({ result: Object.assign({}, state.result, { items: next }) });
    }

    function commit() {
      if (!state.result) return;
      var chosen = state.result.items.filter(function (it) { return it.checked && it.amount > 0 && it.category; });
      if (!chosen.length) { set({ warn: '没有勾选任何记录，请勾选后再确认入账。' }); return; }
      var list = chosen.map(function (it) {
        return {
          id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + Math.random().toString(36).slice(2, 4),
          type: it.type,
          amount: it.amount,
          category: it.category,
          date: it.date,
          note: it.note,
          createdAt: new Date().toISOString()
        };
      });
      if (onCommit) onCommit(list);
      set({ text: '', result: null, warn: '' });
    }

    function cancelConfirm() { set({ result: null, warn: '' }); }

    function toggleMic() {
      if (state.recording) { if (mic && mic.stop) { try { mic.stop(); } catch (e) {} } set({ recording: false }); return; }
      if (!SR) { set({ warn: '当前环境不支持语音（需 HTTPS 或 localhost），请直接输入文字。' }); return; }
      try {
        var rec = new SR();
        mic = rec;
        rec.lang = 'zh-CN';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = function (ev) {
          var finalTxt = '';
          for (var i = 0; i < ev.results.length; i++) {
            var r = ev.results[i];
            if (r.isFinal) finalTxt += r[0].transcript;
          }
          if (finalTxt) set({ text: finalTxt, warn: '' });
        };
        rec.onerror = function (ev) { set({ recording: false, warn: '语音识别不可用（' + ((ev && ev.error) || 'error') + '），请直接输入文字。' }); };
        rec.onend = function () { set({ recording: false }); };
        rec.start();
        set({ recording: true, warn: '' });
      } catch (e) { set({ recording: false, warn: '语音识别不可用，请直接输入文字。' }); }
    }

    var micBtn = SR ? React.createElement('button', {
      type: 'button',
      className: 'pl-smart-mic' + (state.recording ? ' on' : ''),
      onClick: toggleMic,
      title: '语音输入',
      'aria-label': '语音输入'
    }, React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
      React.createElement('rect', { x: 9, y: 2, width: 6, height: 12, rx: 3 }),
      React.createElement('path', { d: 'M5 10a7 7 0 0 0 14 0' }),
      React.createElement('line', { x1: 12, y1: 19, x2: 12, y2: 22 })
    )) : null;

    return React.createElement('div', { className: 'pl-smart-card' },
      React.createElement('div', { className: 'pl-smart-head' },
        React.createElement('span', { className: 'pl-smart-title' }, title),
        micBtn
      ),
      React.createElement('div', { className: 'pl-smart-row' },
        React.createElement('input', {
          className: 'pl-smart-input',
          value: state.text,
          placeholder: '开始使用语音记账吧~',
          onChange: function (e) { set({ text: e.target.value, warn: '', result: null }); },
          onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); recognize(); } }
        }),
        React.createElement('button', { type: 'button', className: 'pl-smart-go', onClick: recognize }, '识别并记一笔')
      ),
      state.warn ? React.createElement('div', { className: 'pl-smart-warn' }, state.warn) : null,
      (state.result && state.result.items && state.result.items.length) ? React.createElement('div', { className: 'pl-smart-confirm' },
        (function () {
          var items = state.result.items;
          var checkedCount = items.filter(function (it) { return it.checked; }).length;
          var rows = items.map(function (it, idx) {
            return React.createElement('div', { key: idx, className: 'pl-smart-item' + (it.checked ? '' : ' off') },
              React.createElement('input', { type: 'checkbox', className: 'pl-smart-check', checked: !!it.checked, onChange: function (e) { toggleItem(idx, e.target.checked); } }),
              React.createElement('span', { className: 'pl-smart-type ' + (it.type === 'income' ? 'inc' : 'exp') }, it.type === 'income' ? '收入' : '支出'),
              React.createElement('span', { className: 'pl-smart-amount' }, (it.type === 'expense' ? '-' : '+') + it.amount.toFixed(2)),
              React.createElement('span', { className: 'pl-smart-cat' }, it.category),
              React.createElement('span', { className: 'pl-smart-meta' }, it.date),
              it.note ? React.createElement('span', { className: 'pl-smart-note' }, it.note) : null
            );
          });
          rows.push(React.createElement('div', { key: 'allrow', className: 'pl-smart-item allrow' },
            React.createElement('input', { type: 'checkbox', className: 'pl-smart-check', checked: checkedCount > 0 && checkedCount === items.length, onChange: function (e) { toggleAll(); } }),
            React.createElement('span', { className: 'pl-smart-alllabel' }, '全选（已选 ' + checkedCount + ' / 共 ' + items.length + ' 笔）')
          ));
          return React.createElement('div', { className: 'pl-smart-confirm-list' }, rows);
        })(),
        React.createElement('div', { className: 'pl-smart-confirm-actions' },
          React.createElement('button', { type: 'button', className: 'pl-smart-cancel', onClick: cancelConfirm }, '取消'),
          React.createElement('button', { type: 'button', className: 'pl-smart-commit', onClick: commit }, '确认入账')
        )
      ) : null
    );
  }

  if (typeof window !== 'undefined') window.SmartLedgerCard = SmartLedgerCard;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      todayISO: todayISO, shiftISO: shiftISO, shiftMonth: shiftMonth, cn2num: cn2num,
      extractDate: extractDate, extractAmount: extractAmount,
      detectType: detectType, detectCategory: detectCategory,
      cleanNote: cleanNote, parseLedgerText: parseLedgerText, parseMulti: parseMulti, splitClauses: splitClauses
    };
  }
})();
