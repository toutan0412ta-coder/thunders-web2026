/* ══════════════════════════════════════════════════
   stats.js  ─  個人スタッツ ページ専用ロジック
   依存: firebase.js が先に読み込まれていること
══════════════════════════════════════════════════ */

/* ── チャートインスタンス（破棄用） ── */
let statsRadarInst = null;
let statsPtsInst   = null;
let statsQFgInst   = null;

/* ════════ データヘルパー ════════ */

function getQ(s, q) {
  return s.quarters ? !!s.quarters[q] : !!(s[q]);
}
function getFgMadeQ(s, q) { return s.fg?.made?.[q] || 0; }
function getFgAttQ(s, q)  { return s.fg?.att?.[q]  || 0; }
function getFtMadeQ(s, q) { return s.ft?.made?.[q] || 0; }
function getFtAttQ(s, q)  { return s.ft?.att?.[q]  || 0; }

function getFgMade(s) {
  return ['q1','q2','q3','q4'].reduce((a, q) => a + getFgMadeQ(s, q), 0);
}
function getFgAtt(s) {
  return ['q1','q2','q3','q4'].reduce((a, q) => a + getFgAttQ(s, q), 0);
}
function getFtMade(s) {
  return ['q1','q2','q3','q4'].reduce((a, q) => a + getFtMadeQ(s, q), 0);
}
function getFtAtt(s) {
  return ['q1','q2','q3','q4'].reduce((a, q) => a + getFtAttQ(s, q), 0);
}
function getRebOff(s) {
  return (s.reb && typeof s.reb === 'object') ? s.reb.off || 0 : 0;
}
function getRebDef(s) {
  return (s.reb && typeof s.reb === 'object') ? s.reb.def || 0 : 0;
}
function getQCount(s) {
  return ['q1','q2','q3','q4'].filter(q => getQ(s, q)).length;
}

/* ════════ 選手番号取得 ════════ */

function getPlayerNumber(playerName) {
  const p = playersData.find(x => x.name === playerName);
  if (!p) return null;
  const n = p.number;
  if (n === undefined || n === null || n === '') return null;
  return String(n);
}

/* ════════ フィルター ════════ */

function buildStatsOpponentFilter() {
  const sel = document.getElementById('statsFilterOpponent');
  if (!sel) return;
  const cur  = sel.value;
  const opps = [...new Set(statsData.map(s => s.opponent))].sort();
  sel.innerHTML = '<option value="">すべて</option>';
  opps.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = cur;
}

function clearStatsFilters() {
  document.getElementById('statsFilterOpponent').value = '';
  document.getElementById('statsDateFrom').value       = '';
  document.getElementById('statsDateTo').value         = '';
  renderStatsPage();
}

/* ════════ 選手グループ切り替え ════════ */

function switchPlayerGroup(grp) {
  currentPlayerGroup = grp;
  selectedPlayer     = null;
  document.querySelectorAll('.player-group-tab').forEach(b => {
    b.classList.remove('active-tab');
    if (b.dataset.grp === grp) b.classList.add('active-tab');
  });
  renderPlayerBtns();
  clearStatsDisplay();
}

function renderPlayerBtns() {
  const grid = document.getElementById('playerBtnGrid');
  if (!grid) return;

  const players = playersData
    .filter(p => p.group === currentPlayerGroup)
    .slice()
    .sort((a, b) => {
      const na = (a.number !== undefined && a.number !== null && a.number !== '')
        ? Number(a.number) : Infinity;
      const nb = (b.number !== undefined && b.number !== null && b.number !== '')
        ? Number(b.number) : Infinity;
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name, 'ja');
    });

  if (!players.length) {
    grid.innerHTML = '<span style="color:#888;font-size:13px;">選手が登録されていません</span>';
    return;
  }

  /* ★ 背番号は表示せず、選手名のみ表示 */
  grid.innerHTML = players.map(p => {
    const sel = selectedPlayer === p.name
      ? (p.group === 'female' ? 'selected-female'
        : p.group === 'male'  ? 'selected-male'
        : 'selected-ob')
      : '';
    return `<button class="player-btn ${sel}"
              onclick="selectPlayer('${escH(p.name)}')">${escH(p.name)}</button>`;
  }).join('');
}

function selectPlayer(name) {
  selectedPlayer = name;
  renderPlayerBtns();
  renderStatsPage();
}

function clearStatsDisplay() {
  const block  = document.getElementById('statsPlayerBlock');
  const noData = document.getElementById('statsNoData');
  if (block)  block.style.display  = 'none';
  if (noData) {
    noData.style.display = 'block';
    noData.textContent   = '上のボタンから選手を選択してください';
  }
}

/* ════════ スタッツページ描画 ════════ */

function renderStatsPage() {
  if (!selectedPlayer) { clearStatsDisplay(); return; }

  const opp = document.getElementById('statsFilterOpponent')?.value || '';
  const df  = document.getElementById('statsDateFrom')?.value       || '';
  const dt  = document.getElementById('statsDateTo')?.value         || '';

  const rows = statsData.filter(s => {
    if (s.playerName !== selectedPlayer) return false;
    if (opp && s.opponent !== opp)       return false;
    if (df  && s.date < df)              return false;
    if (dt  && s.date > dt)              return false;
    return true;
  }).sort((a, b) => a.date < b.date ? -1 : 1);

  if (!rows.length) {
    clearStatsDisplay();
    document.getElementById('statsNoData').textContent = '該当するデータがありません';
    return;
  }

  /* ── ヘッダー装飾 ── */
  const pInfo = playersData.find(p => p.name === selectedPlayer) || { group: 'female' };
  const grad  = pInfo.group === 'female'
    ? 'linear-gradient(135deg,var(--female-color),#e91e63)'
    : pInfo.group === 'male'
      ? 'linear-gradient(135deg,var(--male-color),#1976d2)'
      : 'linear-gradient(135deg,var(--ob-color),#9c27b0)';
  const icon  = pInfo.group === 'female' ? '👧' : pInfo.group === 'male' ? '👦' : '🎓';

  const playerNum = getPlayerNumber(selectedPlayer);
  const numEl     = document.getElementById('statsPlayerNumber');
  const tableNum  = document.getElementById('statsTablePlayerNumber');

  if (playerNum !== null) {
    numEl.textContent    = '#' + playerNum; numEl.style.display    = '';
    tableNum.textContent = '#' + playerNum; tableNum.style.display = '';
  } else {
    numEl.style.display = 'none'; tableNum.style.display = 'none';
  }

  document.getElementById('statsPlayerHeader').style.background = grad;
  document.getElementById('statsPlayerIcon').textContent         = icon;
  document.getElementById('statsPlayerName').textContent         = selectedPlayer;
  document.getElementById('statsTablePlayerName').textContent    = selectedPlayer;

  /* ── 集計 ── */
  let tFgM=0, tFgA=0, tFtM=0, tFtA=0, tRO=0, tRD=0, tAst=0, tStl=0, tBlk=0, tQs=0;
  const fgMQ={q1:0,q2:0,q3:0,q4:0}, fgAQ={q1:0,q2:0,q3:0,q4:0};
  const ftMQ={q1:0,q2:0,q3:0,q4:0}, ftAQ={q1:0,q2:0,q3:0,q4:0};
  const qCnt={q1:0,q2:0,q3:0,q4:0};

  rows.forEach(s => {
    ['q1','q2','q3','q4'].forEach(q => {
      if (getQ(s, q)) qCnt[q]++;
      fgMQ[q] += getFgMadeQ(s, q); fgAQ[q] += getFgAttQ(s, q);
      ftMQ[q] += getFtMadeQ(s, q); ftAQ[q] += getFtAttQ(s, q);
    });
    tFgM += getFgMade(s); tFgA += getFgAtt(s);
    tFtM += getFtMade(s); tFtA += getFtAtt(s);
    tRO  += getRebOff(s); tRD  += getRebDef(s);
    tAst += s.ast || 0;   tStl += s.stl || 0;  tBlk += s.blk || 0;
    tQs  += getQCount(s);
  });

  const totalPts = tFgM * 2 + tFtM;
  const fgPct    = tFgA > 0 ? (tFgM / tFgA * 100).toFixed(1) : '-';
  const ftPct    = tFtA > 0 ? (tFtM / tFtA * 100).toFixed(1) : '-';
  const avgPts   = rows.length > 0 ? (totalPts / rows.length).toFixed(1) : 0;

  document.getElementById('statsPlayerSub').textContent =
    `${rows.length}試合 / 出場${tQs}Q / 平均${avgPts}点`;

  /* ── サマリーカード ── */
  document.getElementById('statsSummaryCards').innerHTML = [
    { v: rows.length,                       l: '試合数'      },
    { v: tQs,                               l: '出場Q数'     },
    { v: totalPts,                          l: '総得点'      },
    { v: avgPts,                            l: '平均得点'    },
    { v: `${tFgM}/${tFgA}`,                 l: 'FG成功/試投' },
    { v: fgPct === '-' ? '-' : fgPct + '%', l: 'FG成功率'    },
    { v: `${tFtM}/${tFtA}`,                 l: 'FT成功/試投' },
    { v: ftPct === '-' ? '-' : ftPct + '%', l: 'FT成功率'    },
    { v: tRO + tRD,                         l: 'REB合計'     },
    { v: tAst,                              l: 'AST'         },
    { v: tStl,                              l: 'STL'         },
    { v: tBlk,                              l: 'BLK'         },
  ].map(c =>
    `<div class="stats-card">
       <div class="sc-val">${c.v}</div>
       <div class="sc-lbl">${c.l}</div>
     </div>`
  ).join('');

  /* ── チャート ── */
  const gameLabels = rows.map(s => fmtDate(s.date));
  const fgPctN = tFgA > 0 ? tFgM / tFgA * 100 : 0;
  const ftPctN = tFtA > 0 ? tFtM / tFtA * 100 : 0;
  const ptsScore = Math.min(totalPts / rows.length / 20 * 100, 100);
  const rebScore = Math.min((tRO + tRD) / rows.length / 10 * 100, 100);
  const astScore = Math.min(tAst / rows.length / 5 * 100, 100);
  const stlScore = Math.min(tStl / rows.length / 3 * 100, 100);

  if (statsRadarInst) statsRadarInst.destroy();
  statsRadarInst = new Chart(document.getElementById('statsRadarChart'), {
    type: 'radar',
    data: {
      labels: ['得点力','FG精度','FT精度','リバウンド','アシスト','スティール'],
      datasets: [{
        label: selectedPlayer,
        data: [ptsScore, fgPctN, ftPctN, rebScore, astScore, stlScore],
        backgroundColor: 'rgba(37,99,168,.2)',
        borderColor: '#2563a8',
        pointBackgroundColor: '#2563a8',
        pointRadius: 4, borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: {
        beginAtZero: true, max: 100,
        ticks: { stepSize: 25, font: { size: 9 }, callback: v => v + '%' },
        pointLabels: { font: { size: 10 } }
      }},
      plugins: { legend: { display: false } }
    }
  });

  if (statsPtsInst) statsPtsInst.destroy();
  statsPtsInst = new Chart(document.getElementById('statsPtsChart'), {
    type: 'bar',
    data: {
      labels: gameLabels,
      datasets: [
        { label: '2P得点', data: rows.map(s => getFgMade(s) * 2), backgroundColor: '#f5a623', stack: 'pts' },
        { label: 'FT得点', data: rows.map(s => getFtMade(s)),     backgroundColor: '#4a90c4', stack: 'pts' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 } } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 2, font: { size: 10 } } }
      },
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } }
    }
  });

  if (statsQFgInst) statsQFgInst.destroy();
  statsQFgInst = new Chart(document.getElementById('statsQFgChart'), {
    type: 'bar',
    data: {
      labels: ['1Q','2Q','3Q','4Q'],
      datasets: [
        { label: 'FG成功', data: [fgMQ.q1,fgMQ.q2,fgMQ.q3,fgMQ.q4], backgroundColor: '#f5a623' },
        { label: 'FG失敗', data: [fgAQ.q1-fgMQ.q1, fgAQ.q2-fgMQ.q2, fgAQ.q3-fgMQ.q3, fgAQ.q4-fgMQ.q4], backgroundColor: '#e0e0e0' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } }
      },
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } }
    }
  });

  /* ── 詳細テーブル ── */
  function nd(v)       { return (!v || v === 0) ? '' : v; }
  function qMark(b)    { return b ? `<span class="q-check">✓</span>` : `<span class="q-empty">-</span>`; }
  function pctCell(m, a) {
    if (!a) return '';
    const p = (m / a * 100).toFixed(1);
    return `<span class="${Number(p) >= 50 ? 'pct-high' : 'pct-low'}">${p}%</span>`;
  }

  document.getElementById('statsMainBody').innerHTML = rows.map(s => {
    const fgM1=getFgMadeQ(s,'q1'), fgM2=getFgMadeQ(s,'q2'), fgM3=getFgMadeQ(s,'q3'), fgM4=getFgMadeQ(s,'q4');
    const fgA1=getFgAttQ(s,'q1'),  fgA2=getFgAttQ(s,'q2'),  fgA3=getFgAttQ(s,'q3'),  fgA4=getFgAttQ(s,'q4');
    const ftM1=getFtMadeQ(s,'q1'), ftM2=getFtMadeQ(s,'q2'), ftM3=getFtMadeQ(s,'q3'), ftM4=getFtMadeQ(s,'q4');
    const ftA1=getFtAttQ(s,'q1'),  ftA2=getFtAttQ(s,'q2'),  ftA3=getFtAttQ(s,'q3'),  ftA4=getFtAttQ(s,'q4');
    const fgMt = fgM1+fgM2+fgM3+fgM4, fgAt = fgA1+fgA2+fgA3+fgA4;
    const ftMt = ftM1+ftM2+ftM3+ftM4, ftAt = ftA1+ftA2+ftA3+ftA4;
    const qCntRow = ['q1','q2','q3','q4'].filter(q => getQ(s, q)).length;
    const jr = (s.isJr === true || s.isJr === 'true') ? ' (Jr)' : '';
    return `<tr>
      <td>${fmtDate(s.date)}</td>
      <td>${escH(s.category || '')}${jr}</td>
      <td style="text-align:left;">${escH(s.matchName)}</td>
      <td>${escH(s.opponent)}</td>
      <td class="bl-thick-left">${qMark(getQ(s,'q1'))}</td>
      <td>${qMark(getQ(s,'q2'))}</td>
      <td>${qMark(getQ(s,'q3'))}</td>
      <td>${qMark(getQ(s,'q4'))}</td>
      <td style="font-weight:700;">${qCntRow || ''}</td>
      <td class="bl-thick-left td-fgm">${nd(fgM1)}</td>
      <td class="td-fgm">${nd(fgM2)}</td>
      <td class="td-fgm">${nd(fgM3)}</td>
      <td class="td-fgm">${nd(fgM4)}</td>
      <td class="td-fgm" style="font-weight:700;">${nd(fgMt)}</td>
      <td class="bl-thick-left td-fga">${nd(fgA1)}</td>
      <td class="td-fga">${nd(fgA2)}</td>
      <td class="td-fga">${nd(fgA3)}</td>
      <td class="td-fga">${nd(fgA4)}</td>
      <td class="td-fga" style="font-weight:700;">${nd(fgAt)}</td>
      <td class="bl-thick-left">${pctCell(fgMt, fgAt)}</td>
      <td class="bl-thick-left td-ftm">${nd(ftM1)}</td>
      <td class="td-ftm">${nd(ftM2)}</td>
      <td class="td-ftm">${nd(ftM3)}</td>
      <td class="td-ftm">${nd(ftM4)}</td>
      <td class="td-ftm" style="font-weight:700;">${nd(ftMt)}</td>
      <td class="bl-thick-left td-fta">${nd(ftA1)}</td>
      <td class="td-fta">${nd(ftA2)}</td>
      <td class="td-fta">${nd(ftA3)}</td>
      <td class="td-fta">${nd(ftA4)}</td>
      <td class="td-fta" style="font-weight:700;">${nd(ftAt)}</td>
      <td class="bl-thick-left">${pctCell(ftMt, ftAt)}</td>
      <td class="bl-thick-left">${nd(getRebOff(s))}</td>
      <td>${nd(getRebDef(s))}</td>
      <td>${nd(s.ast)}</td>
      <td>${nd(s.stl)}</td>
      <td>${nd(s.blk)}</td>
    </tr>`;
  }).join('');

  /* ── フッター合計行 ── */
  const fgPF = tFgA > 0
    ? `<span class="${Number(fgPct) >= 50 ? 'pct-high' : 'pct-low'}">${fgPct}%</span>` : '-';
  const ftPF = tFtA > 0
    ? `<span class="${Number(ftPct) >= 50 ? 'pct-high' : 'pct-low'}">${ftPct}%</span>` : '-';

  document.getElementById('statsMainFoot').innerHTML = `<tr>
    <td colspan="4" style="text-align:left;">合計（${rows.length}試合）</td>
    <td class="bl-thick-left">${qCnt.q1 || ''}</td>
    <td>${qCnt.q2 || ''}</td>
    <td>${qCnt.q3 || ''}</td>
    <td>${qCnt.q4 || ''}</td>
    <td>${tQs}</td>
    <td class="bl-thick-left">${fgMQ.q1 || ''}</td>
    <td>${fgMQ.q2 || ''}</td>
    <td>${fgMQ.q3 || ''}</td>
    <td>${fgMQ.q4 || ''}</td>
    <td>${tFgM}</td>
    <td class="bl-thick-left">${fgAQ.q1 || ''}</td>
    <td>${fgAQ.q2 || ''}</td>
    <td>${fgAQ.q3 || ''}</td>
    <td>${fgAQ.q4 || ''}</td>
    <td>${tFgA}</td>
    <td class="bl-thick-left">${fgPF}</td>
    <td class="bl-thick-left">${ftMQ.q1 || ''}</td>
    <td>${ftMQ.q2 || ''}</td>
    <td>${ftMQ.q3 || ''}</td>
    <td>${ftMQ.q4 || ''}</td>
    <td>${tFtM}</td>
    <td class="bl-thick-left">${ftAQ.q1 || ''}</td>
    <td>${ftAQ.q2 || ''}</td>
    <td>${ftAQ.q3 || ''}</td>
    <td>${ftAQ.q4 || ''}</td>
    <td>${tFtA}</td>
    <td class="bl-thick-left">${ftPF}</td>
    <td class="bl-thick-left">${tRO}</td>
    <td>${tRD}</td>
    <td>${tAst}</td>
    <td>${tStl}</td>
    <td>${tBlk}</td>
  </tr>`;

  document.getElementById('statsPlayerBlock').style.display = 'block';
  document.getElementById('statsNoData').style.display      = 'none';
}
