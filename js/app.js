(function () {
  'use strict';

  const KEY = 'family_ledger_v1';
  const CATEGORIES = ['饮食', '人情', '租房·房贷', '交通出行', '购物消费', '医疗健康',
    '娱乐休闲', '教育学习', '通信网络', '水电燃气', '服饰美容', '家居日用',
    '育儿', '旅行度假', '其他'];
  const COLORS = {
    '饮食': '#FF6B6B', '人情': '#EE5253', '租房·房贷': '#FECA57', '交通出行': '#54A0FF',
    '购物消费': '#5F27CD', '医疗健康': '#FF9FF3', '娱乐休闲': '#00D2D3', '教育学习': '#1DD1A1',
    '通信网络': '#48DBFB', '水电燃气': '#FAB1A0', '服饰美容': '#FD79A8', '家居日用': '#A29BFE',
    '育儿': '#FDCB6E', '旅行度假': '#55E6C1', '其他': '#95A5A6', '小额花销': '#636E72'
  };

  let data = load();
  let currentMonth = ym(new Date());
  let editingId = null;

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function money(n) { return '¥' + Number(n).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && Array.isArray(o.records)) return o;
    } catch (e) {}
    return { records: [], password_hash: null };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
  function mk(type, extra) {
    return Object.assign({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 7), type: type, ts: new Date().toISOString() }, extra);
  }
  // ---------- 免密登录：独立存储，不混入账本数据 ----------
  const FL_AUTO = 'fl_auto_login';
  const FL_SES = 'fl_session';
  function getAuto() { return localStorage.getItem(FL_AUTO) === '1'; }
  function setAuto(v) { localStorage.setItem(FL_AUTO, v ? '1' : '0'); }
  function isAuthed() { return localStorage.getItem(FL_SES) === '1'; }
  function setAuthed(v) { localStorage.setItem(FL_SES, v ? '1' : ''); }

  async function sha256(text) {
    if (crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {}
    }
    // 非安全上下文(如局域网 http)降级，保证功能可用
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // ---------- 数据计算 ----------
  function balance() {
    let b = 0;
    for (const r of data.records) b += (r.type === 'expense' ? -r.amount : r.amount);
    return b;
  }
  function months() {
    const s = new Set();
    for (const r of data.records) if (r.date) s.add(r.date.slice(0, 7));
    s.add(ym(new Date()));
    return Array.from(s).sort().reverse();
  }

  // ---------- 渲染 ----------
  function renderBalance() {
    $('balance-value').textContent = money(balance());
    $('balance-month').textContent = '本月：' + currentMonth;
  }
  function fillMonthSelect(sel) {
    const ms = months();
    sel.innerHTML = ms.map(m => `<option value="${m}">${m}</option>`).join('');
    if (ms.includes(currentMonth)) sel.value = currentMonth;
    else sel.value = ms[0];
  }
  function renderHistory() {
    const m = $('history-month').value || currentMonth;
    const list = data.records
      .filter(r => r.date && r.date.slice(0, 7) === m)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.ts < b.ts ? 1 : -1)));
    const box = $('history-list');
    if (!list.length) { box.innerHTML = '<div class="empty">本月暂无记录</div>'; return; }
    box.innerHTML = list.map(r => {
      let ic = '💰', title = '', sub = '', amt = 0, cls = 'pos';
      if (r.type === 'salary') {
        ic = r.person === 'husband' ? '👨' : '👩';
        title = (r.person === 'husband' ? '丈夫' : '妻子') + '工资';
        amt = r.amount; cls = 'pos';
      } else if (r.type === 'income_adjust') {
        ic = '➕'; title = '余额矫正(入账)'; amt = r.amount; cls = 'pos';
      } else {
        ic = '🧾'; title = r.category; amt = -r.amount; cls = 'neg';
      }
      sub = (r.date || '') + (r.remark ? ' · ' + r.remark : '');
      const color = COLORS[r.category] || '#999';
      return `<div class="row"><div class="ic" style="background:${color}">${ic}</div>
        <div class="info"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>
        <div class="amt ${cls}">${amt >= 0 ? '+' : ''}${money(amt)}</div>
        <div class="actions">
          <button class="row-btn" data-action="edit" data-id="${r.id}">✏️</button>
          <button class="row-btn" data-action="delete" data-id="${r.id}">🗑</button>
        </div></div>`;
    }).join('');
  }
  function renderSummary() {
    const m = $('summary-month').value || currentMonth;
    let income = 0, expense = 0;
    const groups = {};
    for (const r of data.records) {
      if (!r.date || r.date.slice(0, 7) !== m) continue;
      if (r.type === 'expense') { expense += r.amount; groups[r.category] = (groups[r.category] || 0) + r.amount; }
      else income += r.amount;
    }
    const net = income - expense;
    $('summary-income').textContent = money(income);
    $('summary-expense').textContent = money(expense);
    const netEl = $('summary-net');
    netEl.textContent = money(net);
    netEl.className = net >= 0 ? 'pos' : 'neg';

    const items = Object.keys(groups).map(k => ({ label: k, value: groups[k], color: COLORS[k] || '#999' }))
      .filter(x => x.value > 0).sort((a, b) => b.value - a.value);
    drawPie(items, expense);
    const legend = $('summary-legend');
    if (!items.length) { legend.innerHTML = '<div class="empty">本月暂无支出</div>'; return; }
    legend.innerHTML = items.map(it => {
      const pct = expense > 0 ? (it.value / expense * 100).toFixed(1) + '%' : '0%';
      return `<div class="lg"><span class="dot" style="background:${it.color}"></span>${it.label}
        <span class="pct">${money(it.value)} · ${pct}</span></div>`;
    }).join('');
  }
  function drawPie(items, total) {
    const c = $('summary-pie');
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2, R = w / 2 - 6;
    ctx.clearRect(0, 0, w, h);
    if (!items.length) {
      ctx.fillStyle = '#e6e9ee'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a94a6'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('暂无支出', cx, cy);
      return;
    }
    let start = -Math.PI / 2;
    for (const it of items) {
      const ang = it.value / total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, start, start + ang); ctx.closePath();
      ctx.fillStyle = it.color; ctx.fill();
      start += ang;
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(money(total), cx, cy + 5);
  }

  // ---------- 编辑 / 删除 ----------
  function refreshViews() {
    renderBalance();
    if ($('screen-history').classList.contains('active')) renderHistory();
    if ($('screen-summary').classList.contains('active')) renderSummary();
  }
  function openEdit(id) {
    const r = data.records.find(x => x.id === id);
    if (!r) return;
    editingId = id;
    let html = '';
    if (r.type === 'salary') {
      const m = (r.date || '').slice(0, 7);
      html = `
        <label>月份<input id="ed-month" type="month" value="${m}"></label>
        <label>人员<select id="ed-person">
          <option value="husband" ${r.person === 'husband' ? 'selected' : ''}>丈夫</option>
          <option value="wife" ${r.person === 'wife' ? 'selected' : ''}>妻子</option>
        </select></label>
        <label>金额<input id="ed-amount" type="number" inputmode="decimal" value="${r.amount}"></label>
        <label>备注<input id="ed-remark" type="text" value="${esc(r.remark || '')}"></label>`;
    } else if (r.type === 'expense') {
      const isSmall = r.category === '小额花销';
      const opts = CATEGORIES.map(c => `<option value="${c}" ${r.category === c ? 'selected' : ''}>${c}</option>`).join('');
      html = `
        <label>日期<input id="ed-date" type="date" value="${r.date}"></label>
        ${isSmall ? '<label>用途<input disabled value="小额花销"></label>' : `<label>用途<select id="ed-category">${opts}</select></label>`}
        <label>金额<input id="ed-amount" type="number" inputmode="decimal" value="${r.amount}"></label>
        <label>备注<input id="ed-remark" type="text" value="${esc(r.remark || '')}"></label>`;
    } else {
      html = `
        <label>日期<input id="ed-date" type="date" value="${r.date}"></label>
        <label>类型<input disabled value="余额矫正(入账)"></label>
        <label>金额<input id="ed-amount" type="number" inputmode="decimal" value="${r.amount}"></label>
        <label>备注<input id="ed-remark" type="text" value="${esc(r.remark || '')}"></label>`;
    }
    $('edit-body').innerHTML = html;
    $('edit-modal').classList.remove('hidden');
  }
  function saveEdit() {
    const r = data.records.find(x => x.id === editingId);
    if (!r) return;
    const amt = parseFloat($('ed-amount').value);
    if (isNaN(amt) || amt <= 0) { alert('请输入有效金额'); return; }
    r.amount = round2(amt);
    if (r.type === 'salary') {
      r.date = ($('ed-month').value || currentMonth) + '-01';
      r.person = $('ed-person').value;
    } else {
      r.date = $('ed-date').value || today();
    }
    if (r.type === 'expense' && r.category !== '小额花销') r.category = $('ed-category').value;
    r.remark = $('ed-remark').value.trim();
    save();
    $('edit-modal').classList.add('hidden');
    refreshViews();
  }
  function deleteRecord(id) {
    const r = data.records.find(x => x.id === id);
    if (!r) return;
    const label = r.type === 'salary' ? '该工资记录'
      : (r.type === 'income_adjust' ? '该余额矫正记录' : '「' + r.category + '」支出');
    if (!confirm('确定删除' + label + '吗？此操作不可撤销')) return;
    data.records = data.records.filter(x => x.id !== id);
    save();
    refreshViews();
  }

  // ---------- 导航 ----------
  function show(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + screen).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    $('nav-' + screen).classList.add('active');
    if (screen === 'history') renderHistory();
    if (screen === 'summary') renderSummary();
  }

  // ---------- 登录流程 ----------
  function showScreen(name) {
    ['setpw-screen', 'login-screen', 'app'].forEach(s => $(s).classList.add('hidden'));
    $(name).classList.remove('hidden');
  }
  async function enterApp() {
    showScreen('app');
    currentMonth = ym(new Date());
    $('salary-month').value = currentMonth;
    $('expense-date').value = today();
    fillMonthSelect($('history-month'));
    fillMonthSelect($('summary-month'));
    renderBalance();
    $('correct-current').value = money(balance());
    show('record');
  }
  async function init() {
    if (!data.password_hash) { showScreen('setpw-screen'); return; }
    if (getAuto() && isAuthed()) { enterApp(); return; }
    showScreen('login-screen');
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 设置密码
    $('setpw-btn').addEventListener('click', async () => {
      const p = $('setpw-password').value, c = $('setpw-confirm').value;
      if (p.length < 4) { $('setpw-error').textContent = '密码至少 4 位'; return; }
      if (p !== c) { $('setpw-error').textContent = '两次输入不一致'; return; }
      data.password_hash = await sha256(p);
      save();
      setAuthed(getAuto());
      $('setpw-error').textContent = '';
      enterApp();
    });
    // 登录
    const doLogin = async () => {
      const p = $('login-password').value;
      if (await sha256(p) === data.password_hash) {
        $('login-error').textContent = '';
        if (getAuto()) setAuthed(true);
        enterApp();
      }
      else { $('login-error').textContent = '密码错误'; }
    };
    $('login-btn').addEventListener('click', doLogin);
    $('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // 底部导航
    $('nav-record').addEventListener('click', () => show('record'));
    $('nav-history').addEventListener('click', () => { fillMonthSelect($('history-month')); show('history'); });
    $('nav-summary').addEventListener('click', () => { fillMonthSelect($('summary-month')); show('summary'); });

    // tabs
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $(t.dataset.tab).classList.add('active');
      if (t.dataset.tab === 'tab-correct') $('correct-current').value = money(balance());
    }));

    // 工资
    $('salary-save').addEventListener('click', () => {
      const m = $('salary-month').value || currentMonth;
      const h = parseFloat($('salary-husband').value) || 0;
      const w = parseFloat($('salary-wife').value) || 0;
      if (h <= 0 && w <= 0) { alert('请至少填写一项工资'); return; }
      if (h > 0) data.records.push(mk('salary', { date: m + '-01', person: 'husband', amount: round2(h), remark: '工资' }));
      if (w > 0) data.records.push(mk('salary', { date: m + '-01', person: 'wife', amount: round2(w), remark: '工资' }));
      save(); renderBalance();
      $('salary-husband').value = ''; $('salary-wife').value = '';
      alert('工资已记录');
    });

    // 支出
    const catSel = $('expense-category');
    catSel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    $('expense-save').addEventListener('click', () => {
      const date = $('expense-date').value || today();
      const cat = catSel.value;
      const amt = parseFloat($('expense-amount').value);
      if (!amt || amt <= 0) { alert('请输入有效金额'); return; }
      data.records.push(mk('expense', { date: date, category: cat, amount: round2(amt), remark: $('expense-remark').value.trim() }));
      save(); renderBalance();
      $('expense-amount').value = ''; $('expense-remark').value = '';
      alert('支出已记录');
    });

    // 矫正余额
    $('correct-real').addEventListener('input', () => {
      const real = parseFloat($('correct-real').value);
      if (isNaN(real)) { $('correct-diff').textContent = ''; return; }
      const diff = round2(balance() - real);
      $('correct-diff').textContent = '差额（记为小额花销）：' + (diff >= 0 ? '+' : '') + money(diff);
    });
    $('correct-save').addEventListener('click', () => {
      const real = parseFloat($('correct-real').value);
      if (isNaN(real)) { alert('请输入真实余额'); return; }
      const diff = round2(balance() - real);
      if (diff > 0) data.records.push(mk('expense', { date: today(), category: '小额花销', amount: diff, remark: '余额矫正' }));
      else if (diff < 0) data.records.push(mk('income_adjust', { date: today(), amount: -diff, remark: '余额矫正(入账)' }));
      save(); renderBalance();
      $('correct-real').value = ''; $('correct-diff').textContent = '';
      alert('余额已矫正' + (diff === 0 ? '（无差额）' : ''));
    });

    // 明细/汇总月份切换
    $('history-month').addEventListener('change', renderHistory);
    $('summary-month').addEventListener('change', renderSummary);

    // 明细列表：编辑 / 删除（事件委托）
    $('history-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') openEdit(id);
      else if (btn.dataset.action === 'delete') deleteRecord(id);
    });
    $('edit-save').addEventListener('click', saveEdit);
    $('edit-cancel').addEventListener('click', () => $('edit-modal').classList.add('hidden'));

    // 设置
    $('btn-settings').addEventListener('click', () => {
      $('auto-login-toggle').checked = getAuto();
      $('settings-modal').classList.remove('hidden');
    });
    $('btn-close-settings').addEventListener('click', () => $('settings-modal').classList.add('hidden'));
    $('btn-logout').addEventListener('click', () => { setAuthed(false); $('settings-modal').classList.add('hidden'); showScreen('login-screen'); $('login-password').value = ''; });
    // 免密登录开关
    $('auto-login-toggle').addEventListener('change', () => {
      const on = $('auto-login-toggle').checked;
      setAuto(on);
      if (on) { setAuthed(true); alert('已开启免密登录，下次打开将直接进入'); }
      else { setAuthed(false); alert('已关闭免密登录，下次需重新输入密码'); }
    });
    $('cp-save').addEventListener('click', async () => {
      const old = $('cp-old').value, nw = $('cp-new').value, cf = $('cp-confirm').value;
      if (await sha256(old) !== data.password_hash) { $('cp-msg').textContent = '原密码错误'; return; }
      if (nw.length < 4) { $('cp-msg').textContent = '新密码至少 4 位'; return; }
      if (nw !== cf) { $('cp-msg').textContent = '两次不一致'; return; }
      data.password_hash = await sha256(nw); save();
      $('cp-msg').textContent = ''; $('cp-old').value = ''; $('cp-new').value = ''; $('cp-confirm').value = '';
      alert('密码已修改');
    });
    // 备份
    $('btn-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '家庭账本备份_' + today() + '.json';
      a.click();
    });
    $('btn-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const o = JSON.parse(reader.result);
          if (!o || !Array.isArray(o.records)) throw 0;
          data = o; save(); renderBalance();
          fillMonthSelect($('history-month')); fillMonthSelect($('summary-month'));
          $('settings-modal').classList.add('hidden');
          alert('导入成功');
        } catch (err) { alert('备份文件无效'); }
      };
      reader.readAsText(f);
    });
  }

  // ---------- 启动 ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // 本地(localhost)测试时不启用缓存，避免每次改完还要清缓存
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (isLocal) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        return;
      }
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); init(); });
})();
