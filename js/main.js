/* ══════════════════════════════════════════════════
   main.js  ─  アプリ全体の初期化・ページ管理・
               ダッシュボード・管理画面・CRUD・認証
══════════════════════════════════════════════════ */

/* ════════ 定数 ════════ */
const ADMIN_PASS      = 'thunders2026';
const MATCH_PAGE_SIZE = 100;
const ADMIN_PAGE_SIZE = 50;

const MONTH_KEYS = [
  '2026-02','2026-03','2026-04','2026-05','2026-06','2026-07',
  '2026-08','2026-09','2026-10','2026-11','2026-12',
  '2027-01','2027-02','2027-03'
];
const MONTH_LABELS = [
  '2月','3月','4月','5月','6月','7月',
  '8月','9月','10月','11月','12月','1月','2月','3月'
];

/* ════════ 状態変数（グローバル共有） ════════ */
let isAdmin         = false;
let matchesData     = [];
let statsData       = [];
let playersData     = [];
let glossaryData    = [];
let filteredMatches = [];

let currentPage       = 1;
let sortCol           = 'date';
let sortDir           = 'asc';
let currentMonthlyCat = '全体';

let currentPlayerGroup = 'female';
let selectedPlayer     = null;

let editingMatchId  = null;
let editingStatsId  = null;
let editingPlayerId = null;

let adminMatchPage = 1;
let adminStatsPage = 1;

let donutChartInst = null;
let barChartInst   = null;

let admMatchSortCol = 'date'; let admMatchSortDir = 'asc';
let admStatsSortCol = 'date'; let admStatsSortDir = 'asc';

/* ════════════════════════════════════════════════
   ユーティリティ
════════════════════════════════════════════════ */

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function fmtDate(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${parseInt(m)}/${parseInt(day)}`;
}

function escH(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function showSaving() {
  const el = document.getElementById('savingIndicator');
  el.textContent      = '💾 保存中...';
  el.style.background = '#1a7a3c';
  el.classList.add('show');
}

function hideSaving(ok = true) {
  const el = document.getElementById('savingIndicator');
  el.textContent      = ok ? '✅ 保存しました' : '❌ 保存失敗';
  el.style.background = ok ? '#1a7a3c' : '#c0392b';
  setTimeout(() => el.classList.remove('show'), 2000);
}

async function saveToFirebase(docName, arr) {
  showSaving();
  try {
    /* ★ 用語集は専用保存関数を使う */
    if (docName === 'glossary') {
      await fbSaveGlossary(arr);
    } else {
      await fbSave(docName, arr);
    }
    hideSaving(true);
  } catch (e) {
    console.error(e);
    hideSaving(false);
    showToast('⚠️ 保存に失敗しました。');
  }
}

function isJrMatch(m) {
  return m.isJr === true || m.isJr === 'true';
}

/* ════════════════════════════════════════════════
   初期化
════════════════════════════════════════════════ */

async function init() {
  const loadingEl = document.getElementById('loadingScreen');
  try {
    /* ① Firestore から初期データを一括取得 */
    [matchesData, statsData, playersData] = await Promise.all([
      fbLoad('matches'),
      fbLoad('stats'),
      fbLoad('players')
    ]);

    /* ★ 用語集は専用関数で取得 */
    glossaryData = await fbLoadGlossary();
    console.log('glossaryData loaded:', glossaryData.length, '件', glossaryData);

    /* ② リアルタイム監視 */
    fbWatch('matches', data => {
      matchesData = data;
      buildOpponentFilter();
      applyFilters();
      renderMonthlySummary();
    });
    fbWatch('stats', data => {
      statsData = data;
      buildStatsOpponentFilter();
      if (selectedPlayer) renderStatsPage();
    });
    fbWatch('players', data => {
      playersData = data;
      renderPlayerBtns();
      if (selectedPlayer) renderStatsPage();
    });

    /* ★ 用語集監視 — ID名を glossary.js に合わせて修正 */
fbWatchGlossary(data => {
  console.log('fbWatchGlossary fired:', data ? data.length : 0, '件');
  glossaryData = (data && data.length > 0) ? data : glossaryData;

  if (document.getElementById('glossaryCatTabs')) {
    renderGlossaryCats();
  }
  if (document.getElementById('ge-cat-list')) {
    renderGlossaryEditor();
  }
});

  } catch (e) {
    console.error('初期化エラー:', e);
    showToast('⚠️ データ読み込みに失敗しました: ' + e.message);
  } finally {
    loadingEl.classList.add('hidden');
  }

  /* ③ 初期描画 — glossaryData 取得完了後に呼ぶ */
  buildOpponentFilter();
  buildStatsOpponentFilter();
  renderPlayerBtns();
  applyFilters();
  renderMonthlySummary();

  /* ★ glossaryData が取得済みであることを確認してから描画 */
  console.log('init renderGlossaryCats 呼び出し時の件数:', glossaryData.length);
  renderGlossaryCats();

  /* ④ ソートヘッダーのイベント登録 */
  bindSortHeaders();

  /* ⑤ レスポンシブ制御 */
  const mq = window.matchMedia('(max-width:900px)');
  function handleMQ(e) {
    const grid = document.getElementById('adminBottomGrid');
    if (grid) grid.style.gridTemplateColumns = e.matches ? '1fr' : '1fr 1fr';
  }
  mq.addEventListener('change', handleMQ);
  handleMQ(mq);
}

/* ════════════════════════════════════════════════
   ページナビゲーション
════════════════════════════════════════════════ */

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('tab-'  + name).classList.add('active');

  if (name === 'admin') {
    renderAdminMatches();
    renderAdminStats();
    renderPlayerMaster();
    renderGlossaryEditor();
  }
  if (name === 'stats')    { buildStatsOpponentFilter(); renderStatsPage(); }
  if (name === 'glossary') { renderGlossaryCats(); }
}

function printPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');
  window.print();
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.id === 'tab-' + pageName
      ? t.classList.add('active')
      : t.classList.remove('active');
  });
}

/* ════════════════════════════════════════════════
   ソートヘッダー
════════════════════════════════════════════════ */

function bindSortHeaders() {
  document.querySelectorAll('#page-dashboard th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (!col) return;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = 'asc'; }
      sortAndRender();
    });
  });
  document.querySelectorAll('#page-admin th.sortable[data-admtable="match"]').forEach(th => {
    th.addEventListener('click', () => admMatchSort(th.dataset.admcol));
  });
  document.querySelectorAll('#page-admin th.sortable[data-admtable="stats"]').forEach(th => {
    th.addEventListener('click', () => admStatsSort(th.dataset.admcol));
  });
}

/* ════════════════════════════════════════════════
   フィルター（ダッシュボード）
════════════════════════════════════════════════ */

function buildOpponentFilter() {
  const sel = document.getElementById('filterOpponent');
  if (!sel) return;
  const cur  = sel.value;
  const opps = [...new Set(matchesData.map(m => m.opponent))].sort();
  sel.innerHTML = '<option value="">相手：すべて</option>';
  opps.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = cur;
}

function clearFilters() {
  ['filterKeyword', 'filterDateFrom', 'filterDateTo']
    .forEach(id => document.getElementById(id).value = '');
  ['filterOpponent', 'filterCategory', 'filterJr', 'filterResult']
    .forEach(id => document.getElementById(id).value = '');
  applyFilters();
}

function applyFilters() {
  const kw  = document.getElementById('filterKeyword')?.value.trim().toLowerCase()  || '';
  const opp = document.getElementById('filterOpponent')?.value  || '';
  const cat = document.getElementById('filterCategory')?.value  || '';
  const jr  = document.getElementById('filterJr')?.value        || '';
  const res = document.getElementById('filterResult')?.value    || '';
  const df  = document.getElementById('filterDateFrom')?.value  || '';
  const dt  = document.getElementById('filterDateTo')?.value    || '';

  filteredMatches = matchesData.filter(m => {
    if (kw  && !(`${m.date}${m.venue}${m.matchName}${m.opponent}`.toLowerCase()).includes(kw)) return false;
    if (opp && m.opponent  !== opp)          return false;
    if (cat && m.category  !== cat)          return false;
    if (jr  !== '' && String(m.isJr) !== jr) return false;
    if (res && m.result    !== res)          return false;
    if (df  && m.date < df)                  return false;
    if (dt  && m.date > dt)                  return false;
    return true;
  });

  currentPage = 1;
  sortAndRender();
  updateCharts();
}

function sortAndRender() {
  filteredMatches.sort((a, b) => {
    let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
    if (['scoreFor', 'scoreAgainst'].includes(sortCol)) {
      va = Number(va); vb = Number(vb);
    }
    return va < vb ? (sortDir === 'asc' ? -1 :  1)
         : va > vb ? (sortDir === 'asc' ?  1 : -1) : 0;
  });
  renderMatchTable();
}

/* ════════════════════════════════════════════════
   試合テーブル
════════════════════════════════════════════════ */

function renderMatchTable() {
  const total = filteredMatches.length;
  const items = filteredMatches.slice(
    (currentPage - 1) * MATCH_PAGE_SIZE,
     currentPage      * MATCH_PAGE_SIZE
  );

  document.getElementById('matchTableBody').innerHTML = items.map(m => {
    const catB = m.category === '男子'
      ? `<span class="badge badge-male">👦<span class="badge-label"> 男子</span></span>`
      : `<span class="badge badge-female">👧<span class="badge-label"> 女子</span></span>`;
    const jrB = isJrMatch(m)
      ? `<span class="badge badge-jr">Jr</span>` : '';
    const resB = m.result === '勝'
      ? `<span class="badge badge-win">勝</span>`
      : m.result === '負'
        ? `<span class="badge badge-lose">負</span>`
        : `<span class="badge badge-draw">引</span>`;
    const yt = m.videoUrl
      ? `<a href="${escH(m.videoUrl)}" target="_blank" rel="noopener"
            class="yt-icon" title="動画">
           <svg width="22" height="16" viewBox="0 0 22 16">
             <rect width="22" height="16" rx="4" fill="#FF0000"/>
             <polygon points="9,4 9,12 16,8" fill="white"/>
           </svg></a>`
      : '<span style="color:#ccc;">—</span>';

    return `<tr>
      <td>${fmtDate(m.date)}</td>
      <td>${escH(m.venue)}</td>
      <td class="td-center">${catB}</td>
      <td><div class="match-name-cell"><span>${escH(m.matchName)}</span>${jrB}</div></td>
      <td>${escH(m.opponent)}</td>
      <td class="score-cell">${m.scoreFor}–${m.scoreAgainst}</td>
      <td class="td-center">${resB}</td>
      <td class="td-center video-col">${yt}</td>
    </tr>`;
  }).join('');

  renderMatchPagination(total);
}

function renderMatchPagination(total) {
  const pages = Math.ceil(total / MATCH_PAGE_SIZE) || 1;
  const el    = document.getElementById('matchPagination');
  if (pages <= 1) {
    el.innerHTML = `<span class="page-info">全${total}件</span>`;
    return;
  }
  let h = `<span class="page-info">全${total}件 / ${pages}ページ</span>`;
  h += `<button class="page-btn" onclick="goMatchPage(${currentPage - 1})"
         ${currentPage <= 1 ? 'disabled' : ''}>◀ 前へ</button>`;
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(pages, currentPage + 2); i++) {
    h += `<button class="page-btn${i === currentPage ? ' active' : ''}"
           onclick="goMatchPage(${i})">${i}</button>`;
  }
  h += `<button class="page-btn" onclick="goMatchPage(${currentPage + 1})"
         ${currentPage >= pages ? 'disabled' : ''}>次へ ▶</button>`;
  el.innerHTML = h;
}

function goMatchPage(p) {
  currentPage = p;
  renderMatchTable();
}

/* ════════════════════════════════════════════════
   チャート
════════════════════════════════════════════════ */

function updateCharts() {
  const wins  = filteredMatches.filter(m => m.result === '勝').length;
  const loses = filteredMatches.filter(m => m.result === '負').length;
  const draws = filteredMatches.filter(m => m.result === '引').length;
  const total = wins + loses + draws;

  document.getElementById('donutPct').textContent =
    total > 0 ? (wins / total * 100).toFixed(1) + '%' : '-%';

  if (donutChartInst) donutChartInst.destroy();
  donutChartInst = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels:   ['勝', '負', '引'],
      datasets: [{
        data:            [wins, loses, draws],
        backgroundColor: ['#1a7a3c', '#c0392b', '#5a6a7a'],
        borderWidth:     0
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend:  { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.raw}試合` } }
      },
      animation: { duration: 400 }
    }
  });

  const mW = {}, mL = {}, mD = {};
  MONTH_KEYS.forEach(k => { mW[k] = 0; mL[k] = 0; mD[k] = 0; });
  filteredMatches.forEach(m => {
    const mk = m.date.slice(0, 7);
    if (mW[mk] === undefined) return;
    if      (m.result === '勝') mW[mk]++;
    else if (m.result === '負') mL[mk]++;
    else                        mD[mk]++;
  });

  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels:   MONTH_LABELS,
      datasets: [
        { label: '勝', data: MONTH_KEYS.map(k => mW[k]), backgroundColor: '#1a7a3c' },
        { label: '負', data: MONTH_KEYS.map(k => mL[k]), backgroundColor: '#c0392b' },
        { label: '引', data: MONTH_KEYS.map(k => mD[k]), backgroundColor: '#5a6a7a' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }
      }
    }
  });
}

/* ════════════════════════════════════════════════
   月別集計
════════════════════════════════════════════════ */

function switchMonthlyCat(el) {
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentMonthlyCat = el.dataset.cat;
  renderMonthlySummary();
}

function renderMonthlySummary() {
  function f(m) {
    switch (currentMonthlyCat) {
      case '全体':   return !isJrMatch(m);
      case '全体Jr': return  isJrMatch(m);
      case '男子':   return m.category === '男子' && !isJrMatch(m);
      case '男子Jr': return m.category === '男子' &&  isJrMatch(m);
      case '女子':   return m.category === '女子' && !isJrMatch(m);
      case '女子Jr': return m.category === '女子' &&  isJrMatch(m);
      default:       return true;
    }
  }
  const data = matchesData.filter(f);
  const tW = {}, tL = {}, tD = {};
  MONTH_KEYS.forEach(k => { tW[k] = 0; tL[k] = 0; tD[k] = 0; });
  data.forEach(m => {
    const mk = m.date.slice(0, 7);
    if (tW[mk] === undefined) return;
    if      (m.result === '勝') tW[mk]++;
    else if (m.result === '負') tL[mk]++;
    else                        tD[mk]++;
  });

  let aW = 0, aL = 0, aD = 0;
  const rows = MONTH_KEYS.map((k, i) => {
    const w = tW[k], l = tL[k], d = tD[k], tot = w + l + d;
    aW += w; aL += l; aD += d;
    const rate = tot > 0 ? (w / tot * 100).toFixed(1) : '-';
    const cls  = tot > 0 && Number(rate) >= 50 ? 'win-rate-high'
               : tot > 0                       ? 'win-rate-low' : '';
    return `<tr>
      <td>${MONTH_LABELS[i]}</td>
      <td style="color:var(--win);font-weight:600;">${w || ''}</td>
      <td style="color:var(--lose);">${l || ''}</td>
      <td style="color:var(--draw);">${d || ''}</td>
      <td class="${cls}">${rate === '-' ? '-' : rate + '%'}</td>
    </tr>`;
  });

  const aT = aW + aL + aD;
  const aR = aT > 0 ? (aW / aT * 100).toFixed(1) + '%' : '-';
  rows.push(`<tr class="total-row">
    <td>合計</td>
    <td style="color:var(--win);font-weight:700;">${aW}</td>
    <td style="color:var(--lose);">${aL}</td>
    <td style="color:var(--draw);">${aD}</td>
    <td class="${aT > 0 && aW / aT >= .5 ? 'win-rate-high' : 'win-rate-low'}">${aR}</td>
  </tr>`);

  document.getElementById('monthlySummaryBody').innerHTML = rows.join('');
}

/* ════════════════════════════════════════════════
   管理画面：試合一覧
════════════════════════════════════════════════ */

function renderAdminMatches() {
  const kw = document.getElementById('adminMatchFilter')?.value.trim().toLowerCase() || '';
  let list = matchesData.filter(m =>
    !kw || `${m.date}${m.matchName}${m.opponent}`.toLowerCase().includes(kw)
  );
  list = [...list].sort((a, b) => {
    let va = a[admMatchSortCol] ?? '', vb = b[admMatchSortCol] ?? '';
    if (['scoreFor', 'scoreAgainst'].includes(admMatchSortCol)) {
      va = Number(va); vb = Number(vb);
    }
    return va < vb ? (admMatchSortDir === 'asc' ? -1 :  1)
         : va > vb ? (admMatchSortDir === 'asc' ?  1 : -1) : 0;
  });

  const total = list.length;
  const pages = Math.ceil(total / ADMIN_PAGE_SIZE) || 1;
  if (adminMatchPage > pages) adminMatchPage = pages;
  const items = list.slice(
    (adminMatchPage - 1) * ADMIN_PAGE_SIZE,
     adminMatchPage      * ADMIN_PAGE_SIZE
  );

  ['date', 'category', 'matchName', 'opponent', 'scoreFor', 'result'].forEach(col => {
    const ic = document.getElementById('admMatchIc-' + col);
    if (ic) ic.textContent = col === admMatchSortCol
      ? (admMatchSortDir === 'asc' ? '▲' : '▼') : '⇅';
  });

  document.getElementById('adminMatchBody').innerHTML = items.map(m => {
    const res = m.result === '勝'
      ? `<span class="badge badge-win">勝</span>`
      : m.result === '負'
        ? `<span class="badge badge-lose">負</span>`
        : `<span class="badge badge-draw">引</span>`;
    return `<tr>
      <td>${m.date}</td>
      <td>
        <span class="badge ${m.category === '男子' ? 'badge-male' : 'badge-female'}">${m.category}</span>
        ${m.isJr ? '<span class="badge badge-jr">Jr</span>' : ''}
      </td>
      <td>${escH(m.matchName)}</td>
      <td>${escH(m.opponent)}</td>
      <td class="td-center">${m.scoreFor}–${m.scoreAgainst}</td>
      <td class="td-center">${res}</td>
      <td class="td-center">
        <button class="btn btn-primary btn-sm" onclick="openMatchModal(${m.id})">✏️</button>
        <button class="btn btn-danger btn-sm"  onclick="deleteMatch(${m.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  renderAdminPagination('adminMatchPagination', total, pages, adminMatchPage, 'adminMatchGo');
}

function adminMatchGo(p) { adminMatchPage = p; renderAdminMatches(); }

function admMatchSort(col) {
  if (admMatchSortCol === col) admMatchSortDir = admMatchSortDir === 'asc' ? 'desc' : 'asc';
  else { admMatchSortCol = col; admMatchSortDir = 'asc'; }
  adminMatchPage = 1;
  renderAdminMatches();
}

/* ════════════════════════════════════════════════
   管理画面：スタッツ一覧
════════════════════════════════════════════════ */

function renderAdminStats() {
  const kw = document.getElementById('adminStatsFilter')?.value.trim().toLowerCase() || '';
  let list = statsData.filter(s =>
    !kw || `${s.playerName}${s.opponent}${s.matchName}`.toLowerCase().includes(kw)
  );
  list = [...list].sort((a, b) => {
    let va = a[admStatsSortCol] ?? '', vb = b[admStatsSortCol] ?? '';
    return va < vb ? (admStatsSortDir === 'asc' ? -1 :  1)
         : va > vb ? (admStatsSortDir === 'asc' ?  1 : -1) : 0;
  });

  const total = list.length;
  const pages = Math.ceil(total / ADMIN_PAGE_SIZE) || 1;
  if (adminStatsPage > pages) adminStatsPage = pages;
  const items = list.slice(
    (adminStatsPage - 1) * ADMIN_PAGE_SIZE,
     adminStatsPage      * ADMIN_PAGE_SIZE
  );

  ['playerName', 'date', 'matchName', 'opponent'].forEach(col => {
    const ic = document.getElementById('admStatsIc-' + col);
    if (ic) ic.textContent = col === admStatsSortCol
      ? (admStatsSortDir === 'asc' ? '▲' : '▼') : '⇅';
  });

  document.getElementById('adminStatsBody').innerHTML = items.map(s => {
    const fgM = getFgMade(s), fgA = getFgAtt(s);
    return `<tr>
      <td>${escH(s.playerName)}</td>
      <td>${s.date}</td>
      <td>${escH(s.matchName)}</td>
      <td>${escH(s.opponent)}</td>
      <td class="td-center">${fgM}/${fgA}</td>
      <td class="td-center">
        <button class="btn btn-primary btn-sm" onclick="openStatsModal(${s.id})">✏️</button>
        <button class="btn btn-danger btn-sm"  onclick="deleteStat(${s.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  renderAdminPagination('adminStatsPagination', total, pages, adminStatsPage, 'adminStatsGo');
}

function adminStatsGo(p) { adminStatsPage = p; renderAdminStats(); }

function admStatsSort(col) {
  if (admStatsSortCol === col) admStatsSortDir = admStatsSortDir === 'asc' ? 'desc' : 'asc';
  else { admStatsSortCol = col; admStatsSortDir = 'asc'; }
  adminStatsPage = 1;
  renderAdminStats();
}

/* ════════════════════════════════════════════════
   管理画面：共通ページネーション
════════════════════════════════════════════════ */

function renderAdminPagination(elId, total, pages, cur, fn) {
  let h = `<span class="page-info">全${total}件${pages > 1 ? ' / ' + pages + 'ページ' : ''}</span>`;
  if (pages > 1) {
    h += `<button class="page-btn" onclick="${fn}(${cur - 1})"
           ${cur <= 1 ? 'disabled' : ''}>◀ 前へ</button>`;
    for (let i = Math.max(1, cur - 2); i <= Math.min(pages, cur + 2); i++) {
      h += `<button class="page-btn${i === cur ? ' active' : ''}"
             onclick="${fn}(${i})">${i}</button>`;
    }
    h += `<button class="page-btn" onclick="${fn}(${cur + 1})"
           ${cur >= pages ? 'disabled' : ''}>次へ ▶</button>`;
  }
  document.getElementById(elId).innerHTML = h;
}

/* ════════════════════════════════════════════════
   管理画面：選手マスタ
════════════════════════════════════════════════ */

function renderPlayerMaster() {
  const groups = [
    { k: 'female', lbl: '👧 女子' },
    { k: 'male',   lbl: '👦 男子' },
    { k: 'ob',     lbl: '🎓 OB'  },
  ];
  document.getElementById('playerMasterGrid').innerHTML = groups.map(g => {
    const ps = playersData.filter(p => p.group === g.k).sort((a, b) => {
      const na = (a.number !== undefined && a.number !== null && a.number !== '')
        ? Number(a.number) : Infinity;
      const nb = (b.number !== undefined && b.number !== null && b.number !== '')
        ? Number(b.number) : Infinity;
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name, 'ja');
    });
    return `<div style="min-width:200px;">
      <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:6px;">${g.lbl}</div>
      ${ps.map(p => {
        const numBadge = (p.number !== undefined && p.number !== null && p.number !== '')
          ? `<span class="badge-number">#${p.number}</span>` : '';
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          ${numBadge}
          <span style="font-size:13px;flex:1;">${escH(p.name)}</span>
          <button class="btn btn-primary btn-sm" onclick="openPlayerModal(${p.id})">✏️</button>
          <button class="btn btn-danger btn-sm"  onclick="deletePlayer(${p.id})">🗑️</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════
   CRUD – 試合
════════════════════════════════════════════════ */

function openMatchModal(id) {
  editingMatchId = id || null;
  document.getElementById('matchModalTitle').textContent =
    id ? '試合データ編集' : '試合データ追加';

  if (id) {
    const m = matchesData.find(x => x.id === id);
    if (!m) return;
    document.getElementById('mDate').value         = m.date;
    document.getElementById('mVenue').value        = m.venue;
    document.getElementById('mCategory').value     = m.category;
    document.getElementById('mIsJr').value         = String(m.isJr);
    document.getElementById('mMatchName').value    = m.matchName;
    document.getElementById('mOpponent').value     = m.opponent;
    document.getElementById('mScoreFor').value     = m.scoreFor;
    document.getElementById('mScoreAgainst').value = m.scoreAgainst;
    document.getElementById('mVideoUrl').value     = m.videoUrl || '';
    document.getElementById('mMemo').value         = m.memo     || '';
  } else {
    ['mDate', 'mVenue', 'mMatchName', 'mOpponent', 'mVideoUrl', 'mMemo']
      .forEach(i => document.getElementById(i).value = '');
    document.getElementById('mCategory').value     = '男子';
    document.getElementById('mIsJr').value         = 'false';
    document.getElementById('mScoreFor').value     = '0';
    document.getElementById('mScoreAgainst').value = '0';
  }
  document.getElementById('matchModal').classList.add('open');
}

async function saveMatch() {
  const date      = document.getElementById('mDate').value;
  const venue     = document.getElementById('mVenue').value.trim();
  const matchName = document.getElementById('mMatchName').value.trim();
  const opponent  = document.getElementById('mOpponent').value.trim();
  if (!date || !venue || !matchName || !opponent) {
    showToast('⚠️ 必須項目を入力してください');
    return;
  }
  const sf = Number(document.getElementById('mScoreFor').value);
  const sa = Number(document.getElementById('mScoreAgainst').value);
  const rec = {
    date, venue,
    category:     document.getElementById('mCategory').value,
    isJr:         document.getElementById('mIsJr').value === 'true',
    matchName, opponent,
    scoreFor:     sf,
    scoreAgainst: sa,
    result:       sf > sa ? '勝' : sf < sa ? '負' : '引',
    videoUrl:     document.getElementById('mVideoUrl').value.trim(),
    memo:         document.getElementById('mMemo').value.trim()
  };
  if (editingMatchId) {
    const i = matchesData.findIndex(x => x.id === editingMatchId);
    if (i >= 0) matchesData[i] = { ...matchesData[i], ...rec };
  } else {
    rec.id = Date.now();
    matchesData.push(rec);
  }
  await saveToFirebase('matches', matchesData);
  closeModal('matchModal');
  showToast('✅ 試合データを保存しました');
}

async function deleteMatch(id) {
  if (!confirm('この試合データを削除しますか？')) return;
  matchesData = matchesData.filter(m => m.id !== id);
  await saveToFirebase('matches', matchesData);
  showToast('🗑️ 削除しました');
}

/* ════════════════════════════════════════════════
   CRUD – スタッツ
════════════════════════════════════════════════ */

function buildStatRecord() {
  const playerName = document.getElementById('sPName').value.trim();
  const date       = document.getElementById('sSDate').value;
  const matchName  = document.getElementById('sSMatchName').value.trim();
  const opponent   = document.getElementById('sSOpponent').value.trim();
  if (!playerName || !date || !matchName || !opponent) return null;

  const gv  = id => Number(document.getElementById(id).value) || 0;
  const gbv = id => document.getElementById(id).value === 'true';

  return {
    playerName, date, matchName, opponent,
    category: document.getElementById('sSCategory').value,
    isJr:     document.getElementById('sSIsJr').value === 'true',
    quarters: {
      q1: gbv('sQ1'), q2: gbv('sQ2'), q3: gbv('sQ3'), q4: gbv('sQ4')
    },
    fg: {
      made: { q1: gv('sFgMadeQ1'), q2: gv('sFgMadeQ2'), q3: gv('sFgMadeQ3'), q4: gv('sFgMadeQ4') },
      att:  { q1: gv('sFgAttQ1'),  q2: gv('sFgAttQ2'),  q3: gv('sFgAttQ3'),  q4: gv('sFgAttQ4')  }
    },
    ft: {
      made: { q1: gv('sFtMadeQ1'), q2: gv('sFtMadeQ2'), q3: gv('sFtMadeQ3'), q4: gv('sFtMadeQ4') },
      att:  { q1: gv('sFtAttQ1'),  q2: gv('sFtAttQ2'),  q3: gv('sFtAttQ3'),  q4: gv('sFtAttQ4')  }
    },
    reb: { off: gv('sRebOff'), def: gv('sRebDef') },
    ast: gv('sAst'), stl: gv('sStl'), blk: gv('sBlk')
  };
}

function resetStatsNumbers() {
  ['sQ1', 'sQ2', 'sQ3', 'sQ4']
    .forEach(i => document.getElementById(i).value = 'true');
  ['sFgMadeQ1','sFgMadeQ2','sFgMadeQ3','sFgMadeQ4',
   'sFgAttQ1', 'sFgAttQ2', 'sFgAttQ3', 'sFgAttQ4',
   'sFtMadeQ1','sFtMadeQ2','sFtMadeQ3','sFtMadeQ4',
   'sFtAttQ1', 'sFtAttQ2', 'sFtAttQ3', 'sFtAttQ4',
   'sRebOff','sRebDef','sAst','sStl','sBlk']
    .forEach(i => document.getElementById(i).value = '0');
}

function openStatsModal(id) {
  editingStatsId = id || null;
  document.getElementById('statsModalTitle').textContent =
    id ? 'スタッツ編集' : 'スタッツ追加';

  const sv = (eid, val) => document.getElementById(eid).value = val || 0;

  if (id) {
    const s = statsData.find(x => x.id === id);
    if (!s) return;
    document.getElementById('sPName').value      = s.playerName;
    document.getElementById('sSDate').value      = s.date;
    document.getElementById('sSMatchName').value = s.matchName;
    document.getElementById('sSOpponent').value  = s.opponent;
    document.getElementById('sSCategory').value  = s.category || '女子';
    document.getElementById('sSIsJr').value      = String(s.isJr || false);
    ['q1','q2','q3','q4'].forEach(q =>
      document.getElementById('s' + q.toUpperCase()).value = String(getQ(s, q))
    );
    sv('sFgMadeQ1', s.fg?.made?.q1); sv('sFgMadeQ2', s.fg?.made?.q2);
    sv('sFgMadeQ3', s.fg?.made?.q3); sv('sFgMadeQ4', s.fg?.made?.q4);
    sv('sFgAttQ1',  s.fg?.att?.q1);  sv('sFgAttQ2',  s.fg?.att?.q2);
    sv('sFgAttQ3',  s.fg?.att?.q3);  sv('sFgAttQ4',  s.fg?.att?.q4);
    sv('sFtMadeQ1', s.ft?.made?.q1); sv('sFtMadeQ2', s.ft?.made?.q2);
    sv('sFtMadeQ3', s.ft?.made?.q3); sv('sFtMadeQ4', s.ft?.made?.q4);
    sv('sFtAttQ1',  s.ft?.att?.q1);  sv('sFtAttQ2',  s.ft?.att?.q2);
    sv('sFtAttQ3',  s.ft?.att?.q3);  sv('sFtAttQ4',  s.ft?.att?.q4);
    sv('sRebOff', s.reb?.off); sv('sRebDef', s.reb?.def);
    sv('sAst', s.ast); sv('sStl', s.stl); sv('sBlk', s.blk);
  } else {
    ['sPName', 'sSDate', 'sSMatchName', 'sSOpponent']
      .forEach(i => document.getElementById(i).value = '');
    document.getElementById('sSCategory').value = '女子';
    document.getElementById('sSIsJr').value     = 'false';
    resetStatsNumbers();
  }
  document.getElementById('statsModal').classList.add('open');
}

async function saveStat() {
  const rec = buildStatRecord();
  if (!rec) { showToast('⚠️ 必須項目を入力してください'); return; }

  if (editingStatsId) {
    const i = statsData.findIndex(x => x.id === editingStatsId);
    if (i >= 0) statsData[i] = { ...statsData[i], ...rec };
  } else {
    rec.id = Date.now();
    statsData.push(rec);
  }
  await saveToFirebase('stats', statsData);
  closeModal('statsModal');
  showToast('✅ スタッツを保存しました');
}

async function saveStatAndContinue() {
  const rec = buildStatRecord();
  if (!rec) { showToast('⚠️ 必須項目を入力してください'); return; }

  const keepDate  = document.getElementById('sSDate').value;
  const keepCat   = document.getElementById('sSCategory').value;
  const keepJr    = document.getElementById('sSIsJr').value;
  const keepMatch = document.getElementById('sSMatchName').value;
  const keepOpp   = document.getElementById('sSOpponent').value;

  if (editingStatsId) {
    const i = statsData.findIndex(x => x.id === editingStatsId);
    if (i >= 0) statsData[i] = { ...statsData[i], ...rec };
    editingStatsId = null;
  } else {
    rec.id = Date.now();
    statsData.push(rec);
  }
  await saveToFirebase('stats', statsData);
  showToast('✅ 保存しました。続けて入力できます');

  document.getElementById('sPName').value      = '';
  document.getElementById('sSDate').value      = keepDate;
  document.getElementById('sSCategory').value  = keepCat;
  document.getElementById('sSIsJr').value      = keepJr;
  document.getElementById('sSMatchName').value = keepMatch;
  document.getElementById('sSOpponent').value  = keepOpp;
  resetStatsNumbers();
  document.getElementById('statsModalTitle').textContent = 'スタッツ追加';
  setTimeout(() => document.getElementById('sPName').focus(), 100);
}

async function deleteStat(id) {
  if (!confirm('このスタッツデータを削除しますか？')) return;
  statsData = statsData.filter(s => s.id !== id);
  await saveToFirebase('stats', statsData);
  showToast('🗑️ 削除しました');
}

/* ════════════════════════════════════════════════
   CRUD – 選手マスタ
════════════════════════════════════════════════ */

function openPlayerModal(id) {
  editingPlayerId = id || null;
  document.getElementById('playerModalTitle').textContent =
    id ? '選手マスタ編集' : '選手追加';

  if (id) {
    const p = playersData.find(x => x.id === id);
    if (!p) return;
    document.getElementById('pName').value   = p.name;
    document.getElementById('pGroup').value  = p.group;
    document.getElementById('pNumber').value =
      (p.number !== undefined && p.number !== null) ? p.number : '';
  } else {
    document.getElementById('pName').value   = '';
    document.getElementById('pGroup').value  = 'female';
    document.getElementById('pNumber').value = '';
  }
  document.getElementById('playerModal').classList.add('open');
}

async function savePlayer() {
  const name = document.getElementById('pName').value.trim();
  if (!name) { showToast('⚠️ 選手名を入力してください'); return; }

  const numVal = document.getElementById('pNumber').value;
  const rec = {
    name,
    group:  document.getElementById('pGroup').value,
    number: numVal !== '' ? Number(numVal) : null
  };

  if (editingPlayerId) {
    const i = playersData.findIndex(x => x.id === editingPlayerId);
    if (i >= 0) playersData[i] = { ...playersData[i], ...rec };
  } else {
    rec.id = Date.now();
    playersData.push(rec);
  }
  await saveToFirebase('players', playersData);
  closeModal('playerModal');
  showToast('✅ 選手マスタを保存しました');
}

async function deletePlayer(id) {
  if (!confirm('この選手を削除しますか？')) return;
  playersData = playersData.filter(p => p.id !== id);
  await saveToFirebase('players', playersData);
  showToast('🗑️ 削除しました');
}

/* ════════════════════════════════════════════════
   データインポート / エクスポート
   ★ { "items": [...] } 形式と [...] 形式の両方に対応
════════════════════════════════════════════════ */

async function importData(e, type) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const parsed = JSON.parse(ev.target.result);

      /* ★ { "items": [...] } 形式と [...] 配列形式の両方を受け付ける */
      let data;
      if (Array.isArray(parsed)) {
        data = parsed;
      } else if (parsed && Array.isArray(parsed.items)) {
        data = parsed.items;
      } else {
        throw new Error('配列または { "items": [...] } 形式のJSONを選択してください');
      }

      if      (type === 'matches')  matchesData  = data;
      else if (type === 'stats')    statsData    = data;
      else if (type === 'players')  playersData  = data;
      else if (type === 'glossary') glossaryData = data;

      if (type === 'glossary') {
        await fbSaveGlossary(data);
      } else {
        await fbSave(type, data);
      }
      showToast(`✅ 読み込み完了 (${data.length}件)`);
    } catch (err) {
      showToast('⚠️ ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}


/* ════════════════════════════════════════════════
   認証
════════════════════════════════════════════════ */

function openAdminAuth() {
  if (isAdmin) { showPage('admin'); return; }
  document.getElementById('authPwInput').value = '';
  document.getElementById('authOverlay').classList.add('open');
  setTimeout(() => document.getElementById('authPwInput').focus(), 100);
}

function doAuth() {
  if (document.getElementById('authPwInput').value === ADMIN_PASS) {
    isAdmin = true;
    closeAuth();
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    showPage('admin');
    showToast('✅ 管理者としてログインしました');
  } else {
    showToast('⚠️ パスワードが違います');
  }
}

function closeAuth() {
  document.getElementById('authOverlay').classList.remove('open');
}

/* ════════════════════════════════════════════════
   DOMContentLoaded  ─  起動
════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('authOverlay')) closeAuth();
  });
  init();
});
