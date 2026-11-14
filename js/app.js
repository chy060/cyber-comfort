/* 赛博解忧局 · 网页版主逻辑
   纯原生 JS，classic script，无构建步骤 */
(function () {
  'use strict';

  var DATA = window.DATA || {};
  var BOOK = window.BOOK || {};
  var MP = window.MOUTHPIECE || {};

  var INSPIRATIONS = DATA.INSPIRATIONS || [];
  var BLINDBOX_ITEMS = DATA.BLINDBOX_ITEMS || [];
  var DRAW_CARDS = DATA.DRAW_CARDS || [];
  var TAROT_CARDS = DATA.TAROT_CARDS || [];
  var MOOD_LIST = DATA.MOOD_LIST || [];
  var WANGBANG_NPC = DATA.WANGBANG_NPC || [];

  var CHAPTERS = BOOK.CHAPTERS || [];
  var DISCLAIMER = BOOK.DISCLAIMER || '';

  var STYLES = MP.STYLES || [];
  var SCENES = MP.SCENES || [];
  var GENERIC = MP.GENERIC || {};

  var CLEAR_KEYS = [
    'cyber_mask',
    'cyber_merit_total',
    'cyber_merit_daily',
    'cyber_merit_date',
    'cyber_streak',
    'cyber_last_auto_sign',
    'cyber_bb_count',
    'cyber_bb_collected',
    'cyber_mood',
    'cyber_insp_history',
    'cyber_draw_date',
    'cyber_draw_card',
    'cyber_book_pos',
    'cyber_dreams'
  ];

  var ENTRIES = [
    { route: 'muyu', icon: '🐟', name: '电子木鱼', desc: '敲一下，功德 +1' },
    { route: 'mood', icon: '🌤', name: '心情打卡', desc: '今天你怎么样' },
    { route: 'blindbox', icon: '🎁', name: '微光盲盒', desc: '抽一件小确幸' },
    { route: 'dream', icon: '🏺', name: '梦想存钱', desc: '为想要的事攒一点' },
    { route: 'tarot', icon: '🔮', name: '赛博塔罗', desc: '抽三张，照见此刻' },
    { route: 'book', icon: '📖', name: '身体说明书', desc: '打工人的毛病合集' },
    { route: 'inspiration', icon: '💡', name: '灵感小事', desc: '18 件小事救场' },
    { route: 'mouthpiece', icon: '💬', name: '职场嘴替', desc: '老板的话，这样回' }
  ];

  var TAB_SET = { home: true, inspiration: true, mine: true };
  var TABS = [
    { route: 'home', icon: '🏠', label: '首页' },
    { route: 'inspiration', icon: '💡', label: '灵感' },
    { route: 'mine', icon: '🌙', label: '我的' }
  ];

  var RARITY_LABEL = { normal: '普通', rare: '稀有', hidden: '隐藏' };
  var RARITY_RANGE = { normal: [1, 8], rare: [9, 13], hidden: [14, 16] };
  var TAROT_POS = ['过去', '现在', '未来'];

  /* ---------------- 基础工具 ---------------- */

  var S = {
    get: function (key, def) {
      try {
        var v = localStorage.getItem(key);
        return (v === null || v === undefined) ? def : v;
      } catch (e) { return def; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, String(val)); } catch (e) {}
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    },
    getJson: function (key, def) {
      var raw = S.get(key, null);
      if (raw === null || raw === '') return def;
      try {
        var v = JSON.parse(raw);
        return (v === null || v === undefined) ? def : v;
      } catch (e) { return def; }
    },
    setJson: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayKey() { return new Date().toDateString(); }

  function dayKey(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function dateLabel() {
    var d = new Date();
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function fmtMoney(n) {
    var num = Math.round((Number(n) || 0) * 100) / 100;
    return num % 1 === 0 ? String(num) : num.toFixed(2);
  }

  function parseAmount(v) {
    var n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 1700);
  }

  /* ---------------- 全局状态 ---------------- */

  var app = {
    mask: '深夜的猫',
    meritTotal: 0,
    dailyMerit: 0,
    streak: 0,
    route: 'home',
    soundOn: true
  };

  var ui = {
    bb: { rolling: false, timer: null, result: null },
    dream: { adding: false },
    tarot: null,
    book: null,
    insp: { current: '' },
    mp: { input: '', results: [], last: {}, sceneName: '' },
    mine: { editing: false }
  };

  var timers = [];
  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  var pageCleanup = null;
  function cleanupPage() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    if (pageCleanup) {
      try { pageCleanup(); } catch (e) {}
      pageCleanup = null;
    }
  }

  function getDailyMerit() {
    var today = todayKey();
    if (S.get('cyber_merit_date', '') !== today) {
      S.set('cyber_merit_date', today);
      S.set('cyber_merit_daily', '0');
      return 0;
    }
    return parseInt(S.get('cyber_merit_daily', '0'), 10) || 0;
  }

  function autoSign() {
    try {
      var lastSign = S.get('cyber_last_auto_sign', '');
      var today = todayKey();
      if (lastSign === today) return;
      var saved = parseInt(S.get('cyber_streak', '0'), 10) || 0;
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var newStreak = lastSign === yesterday.toDateString() ? saved + 1 : 1;
      S.set('cyber_streak', String(newStreak));
      S.set('cyber_last_auto_sign', today);
    } catch (e) {}
  }

  function initState() {
    app.mask = S.get('cyber_mask', '') || '深夜的猫';
    app.meritTotal = parseInt(S.get('cyber_merit_total', '0'), 10) || 0;
    app.dailyMerit = getDailyMerit();
    autoSign();
    app.streak = parseInt(S.get('cyber_streak', '0'), 10) || 0;
  }

  function getTodayMood() {
    var list = S.getJson('cyber_mood', []);
    if (!Array.isArray(list)) return null;
    var today = dayKey(new Date());
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].date === today) return list[i];
    }
    return null;
  }

  function readTodayCard() {
    var savedDate = S.get('cyber_draw_date', '');
    var savedCard = S.get('cyber_draw_card', '');
    if (savedDate === todayKey() && savedCard !== '' && savedCard !== null && savedCard !== undefined) {
      var idx = parseInt(savedCard, 10);
      if (idx >= 0 && idx < DRAW_CARDS.length) {
        return { drawn: true, index: idx, card: DRAW_CARDS[idx] };
      }
    }
    return { drawn: false, index: -1, card: null };
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '凌晨好';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function footer() {
    return '<footer class="footer"><div class="footer-line">赛博解忧局 · 一个不评判你的数字角落</div></footer>';
  }

  function pageHead(title, rightHtml, backAct) {
    return '<div class="page-head">' +
      '<button class="back-btn" data-act="' + (backAct || 'back') + '" aria-label="返回">‹</button>' +
      '<div class="page-title">' + esc(title) + '</div>' +
      '<div class="head-right">' + (rightHtml || '') + '</div>' +
      '</div>';
  }

  /* ---------------- 弹层 ---------------- */

  function closeDialog() {
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function showDialog(opts) {
    var root = document.getElementById('modal-root');
    if (!root) return;
    var okClass = opts.danger ? 'btn-danger' : 'btn';
    root.innerHTML = '<div class="mask" id="maskEl">' +
      '<div class="dialog" role="dialog" aria-modal="true">' +
      '<div class="dialog-title">' + esc(opts.title || '') + '</div>' +
      '<div class="dialog-body">' + esc(opts.body || '') + '</div>' +
      '<div class="dialog-actions">' +
      '<button class="btn-ghost" id="dlgCancel" type="button">' + esc(opts.cancelText || '取消') + '</button>' +
      '<button class="' + okClass + '" id="dlgOk" type="button">' + esc(opts.okText || '确定') + '</button>' +
      '</div></div></div>';
    var mask = document.getElementById('maskEl');
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeDialog();
    });
    document.getElementById('dlgCancel').addEventListener('click', closeDialog);
    document.getElementById('dlgOk').addEventListener('click', function () {
      closeDialog();
      if (opts.onOk) opts.onOk();
    });
  }

  /* ---------------- 首页 ---------------- */

  function paintHome() {
    var info = readTodayCard();
    var mood = getTodayMood();
    var hero;

    if (!info.drawn) {
      hero = '<section class="hero" id="hero" data-act="hero">' +
        '<div class="hero-top"><span class="hero-label">今日卡牌</span><span class="hero-date">' + dateLabel() + '</span></div>' +
        '<div class="hero-back"><div class="back-mark">☾</div><div class="back-hint">点一下 · 抽今天的卡</div></div>' +
        '</section>';
    } else {
      var card = info.card;
      hero = '<section class="hero hero-open" id="hero" data-act="hero">' +
        '<div class="hero-top"><span class="hero-label">今日卡牌</span><span class="hero-date">' + dateLabel() + '</span></div>' +
        '<div class="hero-emoji">' + card.icon + '</div>' +
        '<div class="hero-name">' + esc(card.name) + '</div>' +
        '<div class="hero-text">' + esc(card.text) + '</div>' +
        (card.tip ? '<div class="hero-tip">' + esc(card.tip) + '</div>' : '') +
        '<div class="hero-foot">点卡面 · 去解签 →</div>' +
        '</section>';
    }

    var tiles = ENTRIES.map(function (it) {
      return '<a class="tile" href="#/' + it.route + '">' +
        '<div class="tile-icon">' + it.icon + '</div>' +
        '<div class="tile-name">' + esc(it.name) + '</div>' +
        '<div class="tile-desc">' + esc(it.desc) + '</div>' +
        '</a>';
    }).join('');

    return '<div class="page">' +
      '<div class="topbar"><div>' +
      '<div class="hello">' + greeting() + '，' + esc(app.mask) + '</div>' +
      '<div class="hello-sub">这里不评判你</div>' +
      '</div></div>' +
      hero +
      '<div class="stats">' +
      '<div class="stat"><div class="stat-num">' + app.meritTotal + '</div><div class="stat-label">总功德</div></div>' +
      '<div class="stat-line"></div>' +
      '<div class="stat"><div class="stat-num">' + app.streak + '</div><div class="stat-label">连续天数</div></div>' +
      '<div class="stat-line"></div>' +
      '<div class="stat"><div class="stat-num">' + (mood ? mood.emoji : '—') + '</div><div class="stat-label">今天心情</div></div>' +
      '</div>' +
      '<div class="section-title">八个小角落</div>' +
      '<div class="tiles">' + tiles + '</div>' +
      footer() +
      '</div>';
  }

  function tapHero() {
    var info = readTodayCard();
    if (info.drawn) {
      go('draw');
      return;
    }
    var idx = Math.floor(Math.random() * DRAW_CARDS.length);
    S.set('cyber_draw_date', todayKey());
    S.set('cyber_draw_card', String(idx));
    vibrate(20);
    render();
    toast('今天的牌，翻开了');
  }

  /* ---------------- 电子木鱼 ---------------- */

  var audioPool = [];
  var audioIdx = 0;
  var muyuCombo = 0;
  var muyuLastTap = 0;
  var floatSeq = 0;

  function initAudio() {
    if (audioPool.length) return;
    for (var i = 0; i < 3; i++) {
      try {
        var a = new Audio('./assets/dong.wav');
        a.preload = 'auto';
        a.volume = 0.85;
        audioPool.push(a);
      } catch (e) {}
    }
  }

  function playDong() {
    if (!app.soundOn || !audioPool.length) return;
    var a = audioPool[audioIdx % audioPool.length];
    audioIdx += 1;
    try {
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function rankHtml(daily) {
    var list = WANGBANG_NPC.map(function (n) {
      return { name: n.name, merit: n.merit, me: false };
    });
    list.push({ name: app.mask, merit: daily, me: true });
    list.sort(function (a, b) { return b.merit - a.merit; });
    return list.map(function (r, i) {
      return '<div class="rank-row' + (r.me ? ' me' : '') + '">' +
        '<span class="rank-idx">' + (i + 1) + '</span>' +
        '<span class="rank-name">' + esc(r.name) + (r.me ? '（你）' : '') + '</span>' +
        '<span class="rank-merit">' + r.merit + '</span>' +
        '</div>';
    }).join('');
  }

  function paintMuyu() {
    app.dailyMerit = getDailyMerit();
    var soundLabel = app.soundOn ? '🔔 音效开' : '🔕 音效关';
    return '<div class="page muyu-page">' +
      pageHead('电子木鱼', '<button class="sound-btn" data-act="toggle-sound" type="button">' + soundLabel + '</button>') +
      '<div class="stats">' +
      '<div class="stat"><div class="stat-num" id="mTotal">' + app.meritTotal + '</div><div class="stat-label">总功德</div></div>' +
      '<div class="stat-line"></div>' +
      '<div class="stat"><div class="stat-num" id="mDaily">' + app.dailyMerit + '</div><div class="stat-label">今日功德</div></div>' +
      '<div class="stat-line"></div>' +
      '<div class="stat"><div class="stat-num" id="mCombo">0</div><div class="stat-label">连击</div></div>' +
      '</div>' +
      '<div class="stage" id="muyuStage">' +
      '<div class="muyu" id="muyu" data-act="knock" role="button" aria-label="敲木鱼">' +
      '<div class="muyu-face">🐟</div><div class="muyu-word">咚</div></div>' +
      '<div class="combo-text" id="muyuComboText"></div>' +
      '<div class="hint">轻点木鱼 · 连击有加成</div>' +
      '</div>' +
      '<div class="section-title">今日功德榜（虚构）</div>' +
      '<div class="rank" id="rankList">' + rankHtml(app.dailyMerit) + '</div>' +
      '<p class="rank-tip">榜上是假的，但敲下去那一下是真的。</p>' +
      footer() +
      '</div>';
  }

  function afterMuyu() {
    initAudio();
    pageCleanup = function () {
      clearTimeout(muyuResetTimer);
      var m = document.getElementById('muyu');
      if (m) m.classList.remove('press');
    };
  }

  var muyuResetTimer = null;

  function knockMuyu() {
    var now = Date.now();
    if (now - muyuLastTap < 700) muyuCombo += 1;
    else muyuCombo = 1;
    muyuLastTap = now;

    var mult = 1;
    if (muyuCombo >= 20) mult = 5;
    else if (muyuCombo >= 10) mult = 3;
    else if (muyuCombo >= 5) mult = 2;

    app.meritTotal += mult;
    app.dailyMerit += mult;
    S.set('cyber_merit_total', String(app.meritTotal));
    S.set('cyber_merit_daily', String(app.dailyMerit));
    S.set('cyber_merit_date', todayKey());

    var totalEl = document.getElementById('mTotal');
    var dailyEl = document.getElementById('mDaily');
    var comboEl = document.getElementById('mCombo');
    var comboText = document.getElementById('muyuComboText');
    if (totalEl) totalEl.textContent = app.meritTotal;
    if (dailyEl) dailyEl.textContent = app.dailyMerit;
    if (comboEl) comboEl.textContent = muyuCombo;
    if (comboText) comboText.textContent = '连击 ' + muyuCombo + ' · ×' + mult;

    var rankEl = document.getElementById('rankList');
    if (rankEl) rankEl.innerHTML = rankHtml(app.dailyMerit);

    var muyu = document.getElementById('muyu');
    if (muyu) {
      muyu.classList.add('press');
      setTimeout(function () { muyu.classList.remove('press'); }, 90);
    }

    spawnFloat(mult);
    spawnParticles();

    playDong();
    vibrate(mult >= 3 ? 26 : 12);

    clearTimeout(muyuResetTimer);
    muyuResetTimer = setTimeout(function () {
      muyuCombo = 0;
      var c = document.getElementById('mCombo');
      var t = document.getElementById('muyuComboText');
      if (c) c.textContent = '0';
      if (t) t.textContent = '';
    }, 1600);
  }

  function spawnFloat(mult) {
    var stage = document.getElementById('muyuStage');
    if (!stage) return;
    floatSeq += 1;
    var el = document.createElement('div');
    el.className = 'float';
    el.textContent = '+' + mult;
    el.style.marginLeft = (Math.random() * 60 - 30) + 'px';
    stage.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 950);
  }

  var PARTICLE_FACES = ['✨', '🌸', '✧', '🌼'];

  function spawnParticles() {
    var stage = document.getElementById('muyuStage');
    if (!stage) return;
    var count = Math.random() > 0.55 ? 2 : 1;
    var w = stage.clientWidth || 320;
    var h = stage.clientHeight || 340;

    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      el.className = 'particle p' + (Math.floor(Math.random() * 3));
      el.textContent = PARTICLE_FACES[Math.floor(Math.random() * PARTICLE_FACES.length)];
      el.style.left = Math.round(w / 2 - 24 + Math.random() * 60) + 'px';
      el.style.top = Math.round(h * 0.42 + Math.random() * 46) + 'px';
      stage.appendChild(el);
      setTimeout(function (node) {
        return function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        };
      }(el), 1150);
    }
  }

  function toggleSound() {
    app.soundOn = !app.soundOn;
    var btn = document.querySelector('[data-act="toggle-sound"]');
    if (btn) btn.textContent = app.soundOn ? '🔔 音效开' : '🔕 音效关';
    if (app.soundOn) playDong();
    toast(app.soundOn ? '音效已开' : '音效已关');
  }

  /* ---------------- 心情打卡 ---------------- */

  function paintMood() {
    var list = S.getJson('cyber_mood', []);
    if (!Array.isArray(list)) list = [];
    var today = dayKey(new Date());
    var picked = '';

    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].date === today) { picked = list[i].emoji; break; }
    }

    var moodBtns = MOOD_LIST.map(function (m) {
      return '<button class="mood-btn' + (m.emoji === picked ? ' picked' : '') + '" type="button" ' +
        'data-act="mood" data-emoji="' + esc(m.emoji) + '" data-label="' + esc(m.label) + '">' +
        '<span class="mood-emoji">' + m.emoji + '</span>' +
        '<span class="mood-label">' + esc(m.label) + '</span>' +
        '</button>';
    }).join('');

    var trendHtml = '';
    for (var d = 6; d >= 0; d--) {
      var dt = new Date();
      dt.setDate(dt.getDate() - d);
      var key = dayKey(dt);
      var emoji = '';
      for (var j = 0; j < list.length; j++) {
        if (list[j] && list[j].date === key) { emoji = list[j].emoji; break; }
      }
      trendHtml += '<div class="trend-item' + (d === 0 ? ' today' : '') + '">' +
        '<div class="trend-emoji">' + (emoji || '·') + '</div>' +
        '<div class="trend-date">' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</div>' +
        '</div>';
    }

    var pickedMood = null;
    for (var k = 0; k < MOOD_LIST.length; k++) {
      if (MOOD_LIST[k].emoji === picked) { pickedMood = MOOD_LIST[k]; break; }
    }

    return '<div class="page">' +
      pageHead('心情打卡') +
      '<div class="card">' +
      '<div class="muted">今天你怎么样？点了就记下，同一天可以改。</div>' +
      '<div class="mood-grid">' + moodBtns + '</div>' +
      '<div class="divider"></div>' +
      '<div class="muted">' + (pickedMood ? '今天记的是 ' + pickedMood.emoji + ' ' + esc(pickedMood.label) : '今天还没记') + '</div>' +
      '</div>' +
      '<div class="section-title">最近 7 天</div>' +
      '<div class="trend">' + trendHtml + '</div>' +
      '<p class="faint" style="margin-top:12px">累计记录 ' + list.length + ' 天</p>' +
      '<div class="cta-line"><button class="link-btn" data-act="go" data-route="muyu" type="button">心情记好了，去敲两下木鱼 →</button></div>' +
      footer() +
      '</div>';
  }

  function pickMood(emoji, label) {
    var list = S.getJson('cyber_mood', []);
    if (!Array.isArray(list)) list = [];
    var today = dayKey(new Date());
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].date === today) {
        list[i].emoji = emoji;
        list[i].label = label;
        found = true;
        break;
      }
    }
    if (!found) list.push({ date: today, emoji: emoji, label: label });
    S.setJson('cyber_mood', list.slice(-90));
    render();
    toast('记下了');
  }

  /* ---------------- 微光盲盒 ---------------- */

  function paintBlindbox() {
    var count = parseInt(S.get('cyber_bb_count', '0'), 10) || 0;
    var ids = S.getJson('cyber_bb_collected', []);
    if (!Array.isArray(ids)) ids = [];

    var stage;
    if (ui.bb.result) {
      var r = ui.bb.result;
      stage = '<div class="bb-stage" id="bbStage"><div id="bbFace">' +
        '<span class="rarity rarity-' + r.band + '">' + RARITY_LABEL[r.band] + (r.isNew ? ' · 新收藏' : '') + '</span>' +
        '<div class="bb-icon">' + r.item.icon + '</div>' +
        '<div class="bb-name">' + esc(r.item.name) + '</div>' +
        '<div class="bb-desc">' + esc(r.item.desc) + '</div>' +
        '<div class="bb-price">' + esc(r.item.price) + '</div>' +
        '</div></div>';
    } else {
      stage = '<div class="bb-stage" id="bbStage"><div id="bbFace">' +
        '<div class="gift">🎁</div>' +
        '<div class="bb-name">抽一件小确幸</div>' +
        '<div class="bb-desc">16 件微小但确实存在的好事</div>' +
        '</div></div>';
    }

    var collect = BLINDBOX_ITEMS.map(function (it) {
      var owned = ids.indexOf(it.id) >= 0;
      return '<div class="collect-item' + (owned ? ' owned' : '') + '">' +
        '<div class="collect-icon">' + (owned ? it.icon : '❔') + '</div>' +
        '<div class="collect-name">' + (owned ? esc(it.name) : '未收集') + '</div>' +
        '</div>';
    }).join('');

    return '<div class="page">' +
      pageHead('微光盲盒') +
      '<div class="bb-count">已拆 ' + count + ' 次 · 收集 ' + ids.length + ' / ' + BLINDBOX_ITEMS.length + '</div>' +
      stage +
      '<button class="btn btn-gold" data-act="bb-open" type="button">' + (ui.bb.result ? '再开一个' : '开一个') + '</button>' +
      '<div class="section-title">小确幸图鉴</div>' +
      '<div class="collection">' + collect + '</div>' +
      '<p class="faint" style="margin-top:16px;text-align:center">可以重复抽，每次都会记一笔。</p>' +
      footer() +
      '</div>';
  }

  function afterBlindbox() {
    pageCleanup = function () {
      if (ui.bb.timer) {
        clearInterval(ui.bb.timer);
        ui.bb.timer = null;
      }
      ui.bb.rolling = false;
    };
  }

  function openBlindbox() {
    if (ui.bb.rolling) return;
    var face = document.getElementById('bbFace');
    if (!face) return;

    ui.bb.rolling = true;
    ui.bb.result = null;
    var step = 0;
    face.innerHTML = '<div class="gift shake">🎁</div><div class="bb-name">摇一摇…</div><div class="bb-desc">正在从 16 件里抽一件</div>';

    ui.bb.timer = setInterval(function () {
      step += 1;
      if (step > 7) {
        clearInterval(ui.bb.timer);
        ui.bb.timer = null;
        ui.bb.rolling = false;
        settleBlindbox();
        return;
      }
      var it = BLINDBOX_ITEMS[Math.floor(Math.random() * BLINDBOX_ITEMS.length)];
      face.innerHTML = '<div class="gift shake">🎁</div>' +
        '<div class="bb-icon">' + it.icon + '</div>' +
        '<div class="bb-name">' + esc(it.name) + '</div>';
    }, 96);

    vibrate(14);
  }

  function settleBlindbox() {
    var roll = Math.random();
    var band = 'normal';
    if (roll < 0.05) band = 'hidden';
    else if (roll < 0.25) band = 'rare';

    var range = RARITY_RANGE[band];
    var pool = BLINDBOX_ITEMS.filter(function (it) {
      return it.id >= range[0] && it.id <= range[1];
    });
    var item = pool[Math.floor(Math.random() * pool.length)];

    var count = (parseInt(S.get('cyber_bb_count', '0'), 10) || 0) + 1;
    var ids = S.getJson('cyber_bb_collected', []);
    if (!Array.isArray(ids)) ids = [];
    var isNew = ids.indexOf(item.id) < 0;
    if (isNew) ids.push(item.id);

    S.set('cyber_bb_count', String(count));
    S.setJson('cyber_bb_collected', ids);

    ui.bb.result = { item: item, band: band, isNew: isNew };
    vibrate(band === 'normal' ? 10 : 26);
    render();
  }

  /* ---------------- 梦想存钱 ---------------- */

  function getDreams() {
    var list = S.getJson('cyber_dreams', []);
    return Array.isArray(list) ? list : [];
  }

  function saveDreams(list) {
    S.setJson('cyber_dreams', list.map(function (d) {
      return { id: d.id, name: d.name, saved: Number(d.saved) || 0, target: Number(d.target) || 0 };
    }));
  }

  function paintDream() {
    var list = getDreams();
    var totalSaved = 0;
    var totalTarget = 0;

    var items = list.map(function (d) {
      var saved = Number(d.saved) || 0;
      var target = Number(d.target) || 0;
      totalSaved += saved;
      totalTarget += target;
      var pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
      return '<div class="dream-item">' +
        '<div class="dream-top">' +
        '<div class="dream-name">' + esc(d.name) + '</div>' +
        '<button class="dream-del" data-act="dream-del" data-id="' + esc(d.id) + '" type="button" aria-label="删除">✕</button>' +
        '</div>' +
        '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="dream-meta">' +
        '<span>已存 ¥' + fmtMoney(saved) + ' / 目标 ¥' + fmtMoney(target) + '</span>' +
        '<span class="dream-pct">' + pct + '%</span>' +
        '</div>' +
        '<div class="deposit-row">' +
        '<input class="input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="存入金额" data-amount="' + esc(d.id) + '">' +
        '<button class="btn" data-act="dream-deposit" data-id="' + esc(d.id) + '" type="button">存入</button>' +
        '</div>' +
        '</div>';
    }).join('');

    var overall = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
    var remain = Math.max(0, totalTarget - totalSaved);

    var form = '';
    if (ui.dream.adding) {
      form = '<div class="form">' +
        '<input class="input" id="dreamName" maxlength="20" placeholder="想做的事，比如：一台相机">' +
        '<input class="input" id="dreamTarget" type="number" inputmode="decimal" min="0" step="0.01" placeholder="目标金额，比如：3000">' +
        '<div class="edit-actions">' +
        '<button class="btn-ghost" data-act="dream-add-toggle" type="button">取消</button>' +
        '<button class="btn" data-act="dream-create" type="button">建好了</button>' +
        '</div></div>';
    }

    return '<div class="page">' +
      pageHead('梦想存钱') +
      '<div class="summary">' +
      '<div class="summary-row"><div><div class="summary-num">¥' + fmtMoney(totalSaved) + '</div><div class="summary-sub">总共存下</div></div>' +
      '<div style="text-align:right"><div class="summary-sub">目标 ¥' + fmtMoney(totalTarget) + '</div><div class="summary-sub">还差 ¥' + fmtMoney(remain) + '</div></div></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + overall + '%"></div></div>' +
      '<div class="dream-meta"><span>总进度</span><span class="dream-pct">' + overall + '%</span></div>' +
      '</div>' +
      '<div class="section-title">我的项目</div>' +
      form +
      (list.length ? items : '<div class="card"><div class="empty">还没有存钱项目。<br>给想要的东西起个名字，从第一块钱开始。</div></div>') +
      (ui.dream.adding ? '' : '<button class="btn-ghost" style="margin-top:10px" data-act="dream-add-toggle" type="button">＋ 新建一个梦想</button>') +
      footer() +
      '</div>';
  }

  function createDream() {
    var nameEl = document.getElementById('dreamName');
    var targetEl = document.getElementById('dreamTarget');
    var name = nameEl ? nameEl.value.trim() : '';
    var target = targetEl ? parseAmount(targetEl.value) : 0;

    if (!name) { toast('先给它取个名字'); return; }
    if (!target) { toast('目标金额要大于 0'); return; }

    var list = getDreams();
    list.push({ id: Date.now(), name: name.slice(0, 20), target: target, saved: 0 });
    saveDreams(list);
    ui.dream.adding = false;
    render();
    toast('梦想建好了');
  }

  function depositDream(id) {
    var input = document.querySelector('[data-amount="' + id + '"]');
    var amount = input ? parseAmount(input.value) : 0;
    if (!amount) { toast('先填要存多少'); return; }

    var list = getDreams();
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) {
        list[i].saved = Math.round(((Number(list[i].saved) || 0) + amount) * 100) / 100;
        hit = list[i];
        break;
      }
    }
    if (!hit) return;

    saveDreams(list);
    render();
    if (hit.saved >= hit.target) toast('目标达成，厉害');
    else toast('存进去 ' + fmtMoney(amount) + ' 元');
  }

  function removeDream(id) {
    showDialog({
      title: '删掉这个梦想？',
      body: '已存的金额记录会一起删除。',
      okText: '删除',
      danger: true,
      onOk: function () {
        var list = getDreams().filter(function (d) {
          return String(d.id) !== String(id);
        });
        saveDreams(list);
        render();
        toast('已删除');
      }
    });
  }

  /* ---------------- 赛博塔罗 ---------------- */

  function paintTarot() {
    var t = ui.tarot;
    if (!t) {
      t = ui.tarot = { stage: 'intro', spread: [], picked: [] };
    }

    var body = '';

    if (t.stage === 'intro') {
      body = '<div class="tarot-intro">' +
        '<div class="oracle">🔮</div>' +
        '<p>22 张大阿卡那，洗牌之后选三张。<br>分别照见你的过去、现在和未来。<br>信不信都行，先看看它说什么。</p>' +
        '</div>' +
        '<button class="btn btn-gold" data-act="tarot-start" type="button">洗牌 · 抽三张</button>';
    } else if (t.stage === 'draw') {
      var grid = t.spread.map(function (c, i) {
        if (c.flipped) {
          return '<div class="back-card flipped picked">' + c.icon +
            '<span class="card-mini-name">' + esc(c.name) + '</span></div>';
        }
        return '<button class="back-card" data-act="tarot-pick" data-idx="' + i + '" type="button" aria-label="背面牌">✦</button>';
      }).join('');

      var nextLabel = t.picked.length < 3 ? TAROT_POS[t.picked.length] : '';

      body = '<div class="muted" style="margin-bottom:12px;text-align:center">' +
        '已选 ' + t.picked.length + ' / 3' + (nextLabel ? ' · 下一张代表「' + nextLabel + '」' : '') +
        '</div>' +
        '<div class="spread-grid">' + grid + '</div>' +
        '<p class="faint" style="margin-top:16px;text-align:center">凭直觉点，不用想太久。</p>';
    } else {
      var cards = t.picked.map(function (p) {
        return '<div class="result-card">' +
          '<span class="result-pos">' + esc(p.label) + '</span>' +
          '<div class="result-top"><span class="result-icon">' + p.icon + '</span>' +
          '<span class="result-name">' + esc(p.name) + '</span></div>' +
          '<div class="result-meaning">' + esc(p.meaning) + '</div>' +
          '</div>';
      }).join('');

      body = '<div class="result-cards">' + cards + '</div>' +
        '<button class="btn-ghost" style="margin-top:14px" data-act="tarot-reset" type="button">重新洗牌</button>';
    }

    return '<div class="page">' + pageHead('赛博塔罗') + body + footer() + '</div>';
  }

  function startTarot() {
    var shuffled = TAROT_CARDS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 10);
    ui.tarot = {
      stage: 'draw',
      spread: shuffled.map(function (c) {
        return { icon: c.icon, name: c.name, meaning: c.meaning, flipped: false };
      }),
      picked: []
    };
    render();
  }

  function pickTarot(idx) {
    var t = ui.tarot;
    if (!t || t.stage !== 'draw') return;
    var card = t.spread[idx];
    if (!card || card.flipped || t.picked.length >= 3) return;

    card.flipped = true;
    t.picked.push({
      icon: card.icon,
      name: card.name,
      meaning: card.meaning,
      label: TAROT_POS[t.picked.length]
    });
    vibrate(10);
    render();

    if (t.picked.length === 3) {
      later(function () {
        t.stage = 'result';
        render();
      }, 700);
    }
  }

  /* ---------------- 身体说明书 ---------------- */

  var FLAT = [];
  CHAPTERS.forEach(function (ch, ci) {
    ch.articles.forEach(function (a, ai) {
      FLAT.push({ ci: ci, ai: ai, article: a });
    });
  });

  function paintBook() {
    var b = ui.book;
    if (!b) {
      b = ui.book = { view: 'catalog', ci: 0, ai: 0 };
    }

    if (b.view === 'chapter') return paintBookChapter(b);
    if (b.view === 'article') return paintBookArticle(b);
    return paintBookCatalog();
  }

  function paintBookCatalog() {
    var pos = S.getJson('cyber_book_pos', null);
    var hasPos = pos && typeof pos.ci === 'number' && CHAPTERS[pos.ci] && CHAPTERS[pos.ci].articles[pos.ai];

    var rows = CHAPTERS.map(function (ch, ci) {
      return '<div class="catalog-item" data-act="book-open" data-ci="' + ci + '">' +
        '<div class="cat-icon">' + ch.icon + '</div>' +
        '<div class="cat-main"><div class="cat-title">' + esc(ch.title) + '</div>' +
        '<div class="cat-sub">' + esc(ch.sub) + '</div></div>' +
        '<div class="cat-count">' + ch.articles.length + ' 篇</div>' +
        '</div>';
    }).join('');

    var continueBtn = '';
    if (hasPos) {
      continueBtn = '<button class="btn btn-gold" data-act="book-continue" type="button">继续读：第 ' + CHAPTERS[pos.ci].id + ' 章 · ' + esc(CHAPTERS[pos.ci].articles[pos.ai].t) + '</button>';
    }

    return '<div class="page">' +
      pageHead('身体说明书') +
      '<div class="book-cover">' +
      '<div class="cover-tag">写给打工人的</div>' +
      '<div class="cover-title">身体<br>使用说明书</div>' +
      '<div class="cover-line"></div>' +
      '<div class="cover-sub">8 类人群 · 24 个高发毛病\n症状 / 为什么会这样 / 怎么救 / 一个真实案例</div>' +
      '<div class="cover-note">这不是一本吓你的书。\n它只是把你身上那些说不清的小毛病，一条一条讲明白。</div>' +
      '<div class="cover-actions">' + (continueBtn || '<button class="btn btn-gold" data-act="book-open" data-ci="0" type="button">从第一章开始</button>') + '</div>' +
      '</div>' +
      '<div class="section-title">目录</div>' +
      '<div class="catalog">' + rows + '</div>' +
      '<p class="disclaimer">' + esc(DISCLAIMER) + '</p>' +
      footer() +
      '</div>';
  }

  function paintBookChapter(b) {
    var ch = CHAPTERS[b.ci];
    if (!ch) { b.view = 'catalog'; return paintBookCatalog(); }

    var rows = ch.articles.map(function (a, ai) {
      return '<div class="article-row" data-act="book-article" data-ci="' + b.ci + '" data-ai="' + ai + '">' +
        '<div class="row-no">' + (ai + 1) + '</div>' +
        '<div class="row-main"><div class="row-t">' + esc(a.t) + '</div>' +
        '<div class="row-s">' + esc(a.s) + '</div></div>' +
        '<div class="row-arrow">›</div>' +
        '</div>';
    }).join('');

    return '<div class="page">' +
      pageHead('第 ' + ch.id + ' 章', '', 'book-catalog') +
      '<div class="chapter-hero">' +
      '<div class="chapter-icon">' + ch.icon + '</div>' +
      '<div class="chapter-title">' + esc(ch.title) + '</div>' +
      '<div class="chapter-sub">' + esc(ch.sub) + '</div>' +
      '</div>' +
      rows +
      '<button class="pager-btn ghost" style="margin-top:14px;width:100%" data-act="book-catalog" type="button">返回目录</button>' +
      footer() +
      '</div>';
  }

  function paintBookArticle(b) {
    var ch = CHAPTERS[b.ci];
    if (!ch || !ch.articles[b.ai]) { b.view = 'catalog'; return paintBookCatalog(); }
    var a = ch.articles[b.ai];

    var flatIdx = 0;
    for (var i = 0; i < b.ci; i++) flatIdx += CHAPTERS[i].articles.length;
    flatIdx += b.ai;

    var fixes = a.fix.map(function (f, i) {
      return '<div class="art-fix"><span class="fix-no">' + (i + 1) + '</span>' +
        '<span class="fix-text">' + esc(f) + '</span></div>';
    }).join('');

    var prevDisabled = flatIdx <= 0 ? ' disabled' : '';
    var nextDisabled = flatIdx >= FLAT.length - 1 ? ' disabled' : '';

    return '<div class="page">' +
      pageHead('第 ' + ch.id + ' 章 · 第 ' + (b.ai + 1) + ' 篇', '', 'book-chapter') +
      '<div class="paper-wrap"><div class="paper">' +
      '<div class="paper-top">' + esc(ch.title) + '<span class="breadcrumb-sep">/</span>第 ' + (b.ai + 1) + ' 篇</div>' +
      '<h2 class="art-title">' + esc(a.t) + '</h2>' +
      '<div class="art-symptom"><span class="sym-label">症状</span>' + esc(a.s) + '</div>' +
      '<div class="art-h">为什么会这样</div>' +
      '<p class="art-p">' + esc(a.why) + '</p>' +
      '<div class="art-h">怎么救</div>' +
      fixes +
      '<div class="art-case"><div class="case-label">一个真实案例</div>' +
      '<div class="case-text">' + esc(a.c) + '</div></div>' +
      '<div class="page-no">— ' + (flatIdx + 1) + ' / ' + FLAT.length + ' —</div>' +
      '</div></div>' +
      '<div class="pager">' +
      '<button class="pager-btn" data-act="book-prev" type="button"' + prevDisabled + '>‹ 上一篇</button>' +
      '<button class="pager-btn primary" data-act="book-next" type="button"' + nextDisabled + '>下一篇 ›</button>' +
      '</div>' +
      '<button class="pager-btn ghost" style="width:100%;margin-top:9px" data-act="book-chapter" type="button">返回本章目录</button>' +
      '<p class="disclaimer">' + esc(DISCLAIMER) + '</p>' +
      footer() +
      '</div>';
  }

  function openChapter(ci) {
    if (!CHAPTERS[ci]) return;
    ui.book = { view: 'chapter', ci: ci, ai: 0 };
    render();
    window.scrollTo(0, 0);
  }

  function openArticle(ci, ai) {
    if (!CHAPTERS[ci] || !CHAPTERS[ci].articles[ai]) return;
    ui.book = { view: 'article', ci: ci, ai: ai };
    S.setJson('cyber_book_pos', { ci: ci, ai: ai });
    render();
    window.scrollTo(0, 0);
  }

  function bookStep(delta) {
    var b = ui.book;
    if (!b || b.view !== 'article') return;
    var idx = 0;
    for (var i = 0; i < b.ci; i++) idx += CHAPTERS[i].articles.length;
    idx += b.ai;
    var target = idx + delta;
    if (target < 0 || target >= FLAT.length) return;
    openArticle(FLAT[target].ci, FLAT[target].ai);
  }

  /* ---------------- 灵感小事 ---------------- */

  function getInspHistory() {
    var h = S.getJson('cyber_insp_history', []);
    return Array.isArray(h) ? h : [];
  }

  function ensureInspiration() {
    if (ui.insp.current) return;
    var history = getInspHistory();
    if (history.length) {
      ui.insp.current = history[0];
      return;
    }
    var pick = INSPIRATIONS[Math.floor(Math.random() * INSPIRATIONS.length)] || '';
    ui.insp.current = pick;
    if (pick) S.setJson('cyber_insp_history', [pick]);
  }

  function paintInspiration() {
    ensureInspiration();
    var history = getInspHistory();
    var current = ui.insp.current;
    var idx = INSPIRATIONS.indexOf(current);
    var num = idx >= 0 ? idx + 1 : 1;

    var historyHtml = history.map(function (text, i) {
      return '<div class="history-item' + (i === 0 ? ' active' : '') + '">' + esc(text) + '</div>';
    }).join('');

    return '<div class="page">' +
      '<div class="topbar"><div>' +
      '<div class="hello">灵感小事</div>' +
      '<div class="hello-sub">18 件现在就能做的小事</div>' +
      '</div></div>' +
      '<div class="insp-card">' +
      '<div class="insp-num">' + (num < 10 ? '0' + num : num) + '</div>' +
      '<div class="insp-quote">' + esc(current) + '</div>' +
      '</div>' +
      '<div class="insp-actions">' +
      '<button class="btn-ghost" data-act="insp-shuffle" type="button">换一件</button>' +
      '<button class="btn" data-act="go" data-route="muyu" type="button">去敲木鱼</button>' +
      '</div>' +
      (history.length ? '<div class="section-title">最近抽到</div><div class="history">' + historyHtml + '</div>' : '') +
      '<p class="faint" style="margin-top:14px">共 ' + INSPIRATIONS.length + ' 件 · 已经抽过 ' + history.length + ' 次</p>' +
      footer() +
      '</div>';
  }

  function shuffleInspiration() {
    var all = INSPIRATIONS;
    if (!all.length) return;
    var next = ui.insp.current;
    for (var i = 0; i < 12 && next === ui.insp.current; i++) {
      next = all[Math.floor(Math.random() * all.length)];
    }
    var history = [next].concat(getInspHistory()).slice(0, 20);
    S.setJson('cyber_insp_history', history);
    ui.insp.current = next;
    render();
    vibrate(10);
  }

  /* ---------------- 职场嘴替 ---------------- */

  function pickOne(arr, last) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return arr[0];
    var v = arr[Math.floor(Math.random() * arr.length)];
    var guard = 0;
    while (v === last && guard < 8) {
      v = arr[Math.floor(Math.random() * arr.length)];
      guard += 1;
    }
    return v;
  }

  function paintMouthpiece() {
    var scenes = SCENES.map(function (s, i) {
      return '<button class="chip" data-act="mp-scene" data-idx="' + i + '" type="button">' + esc(s.name) + '</button>';
    }).join('');

    var replyHtml = ui.mp.results.map(function (r, i) {
      return '<div class="reply-card">' +
        '<div class="reply-head"><div><span class="reply-name">' + esc(r.name) + '</span>' +
        '<span class="reply-tag">' + esc(r.tag) + '</span></div>' +
        '<button class="copy-btn" data-act="mp-copy" data-idx="' + i + '" type="button">复制</button></div>' +
        '<div class="reply-text">' + esc(r.text) + '</div>' +
        '</div>';
    }).join('');

    var resultBlock = '';
    if (ui.mp.results.length) {
      resultBlock = '<div class="section-title">三种回法' +
        (ui.mp.sceneName ? ' · ' + esc(ui.mp.sceneName) : ' · 通用版') + '</div>' +
        '<div class="replies">' + replyHtml + '</div>' +
        '<button class="btn-ghost" style="margin-top:12px" data-act="mp-refresh" type="button">换一批</button>';
    }

    return '<div class="page">' +
      pageHead('职场嘴替') +
      '<p class="mp-intro">把老板那句话贴进来，我们给你三种回法。全部在本地生成，不会上传。</p>' +
      '<textarea class="mp-textarea" id="mpInput" maxlength="200" placeholder="例如：今晚加个班，把这个弄完再走。">' + esc(ui.mp.input) + '</textarea>' +
      '<div class="mp-counter" id="mpCounter">' + (ui.mp.input ? ui.mp.input.length : 0) + '/200</div>' +
      '<div class="chips">' + scenes + '</div>' +
      '<button class="btn" data-act="mp-generate" type="button">生成三种回法</button>' +
      resultBlock +
      '<p class="note">内容由本地模板生成，仅供娱乐和参考，不构成职场建议。</p>' +
      footer() +
      '</div>';
  }

  function generateMouthpiece() {
    var text = (ui.mp.input || '').trim();
    if (!text) { toast('先把老板的话贴进来'); return; }

    var scene = MP.matchScene ? MP.matchScene(text) : null;
    var source = scene ? scene.replies : GENERIC;
    var last = ui.mp.last || {};
    var next = {};
    var out = [];

    STYLES.forEach(function (st) {
      var line = pickOne(source[st.key] || [], last[st.key]);
      next[st.key] = line;
      out.push({ key: st.key, name: st.name, tag: st.tag, text: line });
    });

    ui.mp.last = next;
    ui.mp.results = out;
    ui.mp.sceneName = scene ? scene.name : '';
    render();
    vibrate(10);
  }

  function useScene(i) {
    var s = SCENES[i];
    if (!s) return;
    ui.mp.input = s.sample;
    generateMouthpiece();
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    function done() { toast('已复制，去发吧'); }
    function fail() { toast('复制失败，请长按选择'); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (fallbackCopy(text)) done(); else fail();
      });
    } else if (fallbackCopy(text)) {
      done();
    } else {
      fail();
    }
  }

  /* ---------------- 我的 ---------------- */

  function paintMine() {
    var mood = S.getJson('cyber_mood', []);
    if (!Array.isArray(mood)) mood = [];
    var bbCount = parseInt(S.get('cyber_bb_count', '0'), 10) || 0;

    var editBlock = '';
    if (ui.mine.editing) {
      editBlock = '<div class="edit-form">' +
        '<input class="input" id="maskInput" maxlength="12" value="' + esc(app.mask) + '" placeholder="给自己取个名字">' +
        '<div class="edit-actions">' +
        '<button class="btn-ghost" data-act="mine-cancel" type="button">取消</button>' +
        '<button class="btn" data-act="mine-save" type="button">保存</button>' +
        '</div></div>';
    }

    return '<div class="page">' +
      '<div class="topbar"><div>' +
      '<div class="hello">我的</div>' +
      '<div class="hello-sub">只有你看得见</div>' +
      '</div></div>' +
      '<div class="profile">' +
      '<div class="avatar">🌙</div>' +
      '<div class="grow"><div class="profile-name">' + esc(app.mask) + '</div>' +
      '<div class="profile-sub">这是你在解忧局的名字</div></div>' +
      '<button class="copy-btn" data-act="mine-edit" type="button">改名</button>' +
      '</div>' +
      editBlock +
      '<div class="section-title">我的数据</div>' +
      '<div class="stat-grid">' +
      '<div class="stat-box"><div class="stat-num">' + app.meritTotal + '</div><div class="stat-label">总功德</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + app.streak + '</div><div class="stat-label">连续天数</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + mood.length + '</div><div class="stat-label">心情记录</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + bbCount + '</div><div class="stat-label">拆盒次数</div></div>' +
      '</div>' +
      '<div class="section-title">关于</div>' +
      '<div class="about">' +
      '<div class="about-row"><span class="about-label">版本</span><span class="about-value">3.0.0-web</span></div>' +
      '<div class="about-row"><span class="about-label">内容生成</span><span class="about-value">全部在本机生成</span></div>' +
      '<div class="about-row"><span class="about-label">网络</span><span class="about-value">不联网，不上传</span></div>' +
      '<div class="about-row"><span class="about-label">数据</span><span class="about-value">只存在这台设备的浏览器里</span></div>' +
      '</div>' +
      '<div class="danger-zone"><button class="btn-danger" data-act="mine-clear" type="button">清除所有数据</button></div>' +
      footer() +
      '</div>';
  }

  function saveMask() {
    var el = document.getElementById('maskInput');
    var v = el ? el.value.trim() : '';
    if (!v) { toast('名字不能为空'); return; }
    v = v.slice(0, 12);
    app.mask = v;
    S.set('cyber_mask', v);
    ui.mine.editing = false;
    render();
    toast('改好了');
  }

  function askClear() {
    showDialog({
      title: '清除所有数据？',
      body: '功德、心情、盲盒、梦想和阅读进度都会消失，而且找不回来。',
      okText: '继续',
      danger: true,
      onOk: function () {
        showDialog({
          title: '真的确定吗？',
          body: '最后一次确认。清除之后，这里会回到第一次打开的样子。',
          okText: '确定清除',
          danger: true,
          onOk: doClear
        });
      }
    });
  }

  function doClear() {
    for (var i = 0; i < CLEAR_KEYS.length; i++) S.remove(CLEAR_KEYS[i]);

    app.mask = '深夜的猫';
    app.meritTotal = 0;
    app.dailyMerit = 0;
    app.streak = 0;

    ui.bb = { rolling: false, timer: null, result: null };
    ui.dream = { adding: false };
    ui.tarot = null;
    ui.book = null;
    ui.insp = { current: '' };
    ui.mp = { input: '', results: [], last: {}, sceneName: '' };
    ui.mine = { editing: false };

    render();
    toast('已清除全部数据');
  }

  /* ---------------- 每日一抽 ---------------- */

  function paintDraw() {
    var info = readTodayCard();
    var body;

    if (info.drawn) {
      var c = info.card;
      body = '<div class="draw-stage"><div class="draw-card">' +
        '<div class="draw-emoji">' + c.icon + '</div>' +
        '<div class="draw-name">' + esc(c.name) + '</div>' +
        '<div class="draw-text">' + esc(c.text) + '</div>' +
        (c.tip ? '<div class="draw-tip">' + esc(c.tip) + '</div>' : '') +
        '<div class="draw-foot">今天只有这一张 · 明天再来</div>' +
        '</div></div>';
    } else {
      body = '<div class="draw-stage">' +
        '<div class="card-back" data-act="draw-card" role="button" aria-label="抽卡">' +
        '<div class="card-back-mark">☾</div>' +
        '<div class="card-back-hint">点一下 · 抽今天的卡</div>' +
        '</div>' +
        '<button class="btn btn-gold" data-act="draw-card" type="button">抽今天的卡</button>' +
        '</div>';
    }

    return '<div class="page">' + pageHead('每日一抽') + body + footer() + '</div>';
  }

  function drawDaily() {
    var info = readTodayCard();
    if (info.drawn) return;
    var idx = Math.floor(Math.random() * DRAW_CARDS.length);
    S.set('cyber_draw_date', todayKey());
    S.set('cyber_draw_card', String(idx));
    vibrate(20);
    render();
    toast('今天的牌，翻开了');
  }

  /* ---------------- 路由 ---------------- */

  var painters = {
    home: paintHome,
    muyu: paintMuyu,
    mood: paintMood,
    blindbox: paintBlindbox,
    draw: paintDraw,
    tarot: paintTarot,
    book: paintBook,
    dream: paintDream,
    inspiration: paintInspiration,
    mouthpiece: paintMouthpiece,
    mine: paintMine
  };

  var afterPaint = {
    muyu: afterMuyu,
    blindbox: afterBlindbox
  };

  var appEl = document.getElementById('app');
  var tabbarEl = document.getElementById('tabbar');
  var phoneEl = document.getElementById('phone');
  var lastRoute = null;

  function routeName() {
    var raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return painters[raw] ? raw : 'home';
  }

  function go(name) {
    location.hash = '#/' + name;
  }

  function renderTabbar(name) {
    var html = TABS.map(function (t) {
      return '<a class="tab' + (t.route === name ? ' active' : '') + '" href="#/' + t.route + '">' +
        '<span class="tab-icon">' + t.icon + '</span>' +
        '<span class="tab-label">' + t.label + '</span>' +
        '</a>';
    }).join('');
    tabbarEl.innerHTML = html;
    tabbarEl.classList.toggle('show', TAB_SET[name] === true);
    phoneEl.classList.toggle('has-tabs', TAB_SET[name] === true);
  }

  function render() {
    var name = routeName();

    if (location.hash !== '#/' + name) {
      try { history.replaceState(null, '', '#/' + name); }
      catch (e) { location.hash = '#/' + name; }
    }

    cleanupPage();
    app.route = name;
    appEl.innerHTML = painters[name]();
    renderTabbar(name);
    if (afterPaint[name]) afterPaint[name]();

    if (lastRoute !== name) {
      try { window.scrollTo(0, 0); } catch (e) {}
      lastRoute = name;
    }
  }

  /* ---------------- 事件 ---------------- */

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var el = target.closest('[data-act]');
    if (!el) return;

    var act = el.getAttribute('data-act');

    switch (act) {
      case 'back':
        go('home');
        break;
      case 'go':
        go(el.getAttribute('data-route'));
        break;
      case 'hero':
        tapHero();
        break;
      case 'knock':
        knockMuyu();
        break;
      case 'toggle-sound':
        toggleSound();
        break;
      case 'mood':
        pickMood(el.getAttribute('data-emoji'), el.getAttribute('data-label'));
        break;
      case 'bb-open':
        openBlindbox();
        break;
      case 'dream-add-toggle':
        ui.dream.adding = !ui.dream.adding;
        render();
        break;
      case 'dream-create':
        createDream();
        break;
      case 'dream-deposit':
        depositDream(el.getAttribute('data-id'));
        break;
      case 'dream-del':
        removeDream(el.getAttribute('data-id'));
        break;
      case 'tarot-start':
        startTarot();
        break;
      case 'tarot-pick':
        pickTarot(Number(el.getAttribute('data-idx')));
        break;
      case 'tarot-reset':
        startTarot();
        break;
      case 'book-open':
        openChapter(Number(el.getAttribute('data-ci')));
        break;
      case 'book-article':
        openArticle(Number(el.getAttribute('data-ci')), Number(el.getAttribute('data-ai')));
        break;
      case 'book-catalog':
        ui.book = { view: 'catalog', ci: 0, ai: 0 };
        render();
        window.scrollTo(0, 0);
        break;
      case 'book-chapter':
        if (ui.book) {
          ui.book.view = 'chapter';
          render();
          window.scrollTo(0, 0);
        }
        break;
      case 'book-prev':
        bookStep(-1);
        break;
      case 'book-next':
        bookStep(1);
        break;
      case 'book-continue':
        (function () {
          var pos = S.getJson('cyber_book_pos', null);
          if (pos && CHAPTERS[pos.ci] && CHAPTERS[pos.ci].articles[pos.ai]) {
            openArticle(pos.ci, pos.ai);
          } else {
            openChapter(0);
          }
        })();
        break;
      case 'insp-shuffle':
        shuffleInspiration();
        break;
      case 'mp-scene':
        useScene(Number(el.getAttribute('data-idx')));
        break;
      case 'mp-generate':
      case 'mp-refresh':
        generateMouthpiece();
        break;
      case 'mp-copy':
        (function () {
          var item = ui.mp.results[Number(el.getAttribute('data-idx'))];
          if (item) copyText(item.text);
        })();
        break;
      case 'mine-edit':
        ui.mine.editing = true;
        render();
        break;
      case 'mine-cancel':
        ui.mine.editing = false;
        render();
        break;
      case 'mine-save':
        saveMask();
        break;
      case 'mine-clear':
        askClear();
        break;
      case 'draw-card':
        drawDaily();
        break;
      default:
        break;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'mpInput') {
      ui.mp.input = t.value;
      var counter = document.getElementById('mpCounter');
      if (counter) counter.textContent = t.value.length + '/200';
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDialog();
  });

  window.addEventListener('hashchange', render);

  /* ---------------- 启动 ---------------- */

  initState();
  if (!location.hash) {
    try { history.replaceState(null, '', '#/home'); }
    catch (e) { location.hash = '#/home'; }
  }
  render();
})();
