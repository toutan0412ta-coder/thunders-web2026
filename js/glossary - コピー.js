/* ══════════════════════════════════════════════════
   glossary.js
   依存: firebase.js → main.js の順で読み込み済みであること
   glossaryData / escH / showToast / saveToFirebase /
   closeModal はグローバルスコープで共有
══════════════════════════════════════════════════ */

/* ════════ 状態変数 ════════ */
let glossarySelectedCat = null;
let glossarySearchText  = '';
let geSelectedCatIdx    = null;
let editingGCatIdx      = null;
let editingGTermIdx     = null;

const GE_COLORS = [
  '#1565c0','#2e7d32','#c62828','#6a1b9a',
  '#e65100','#00695c','#4527a0','#558b2f'
];

/* ★ animation の subtype を html / url の2種類に分ける */
const BLOCK_TYPES = [
  { type:'body',           label:'本文',                placeholder:'テキストを入力'          },
  { type:'label',          label:'ラベル',               placeholder:'ラベルテキスト'           },
  { type:'lead',           label:'リード文',             placeholder:'リード文を入力'           },
  { type:'list',           label:'リスト',               placeholder:'1行1項目で入力'           },
  { type:'point',          label:'ポイント',             placeholder:'ポイント本文'             },
  { type:'animation',      label:'アニメーション（URL）', placeholder:'URL（GIF/mp4/YouTube）'  },
  { type:'animation_html', label:'アニメーション（HTML）',placeholder:'HTMLコードを入力'        },
];

/* ════════ ユーティリティ ════════ */

function kanaCompare(a, b) {
  return (a || '').localeCompare(b || '', 'ja', { sensitivity:'base' });
}

function getGlossarySorted() {
  if (!Array.isArray(glossaryData) || glossaryData.length === 0) return [];
  return [...glossaryData].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* ════════ 検索 ════════ */

function onGlossarySearch(val) {
  glossarySearchText = val;
  const resultBar = document.getElementById('glossarySearchResultBar');
  if (val.trim()) {
    renderGlossaryAllSearch(val.trim());
    resultBar.style.display = 'block';
  } else {
    resultBar.style.display = 'none';
    document.getElementById('glossarySearchCount').textContent = '';
    renderGlossaryCats();
  }
}

function clearGlossarySearch() {
  const inp = document.getElementById('glossarySearchInput');
  if (inp) inp.value = '';
  glossarySearchText = '';
  const resultBar = document.getElementById('glossarySearchResultBar');
  if (resultBar) resultBar.style.display = 'none';
  const cnt = document.getElementById('glossarySearchCount');
  if (cnt) cnt.textContent = '';
  renderGlossaryCats();
}

function renderGlossaryAllSearch(kw) {
  const sorted    = getGlossarySorted();
  const termEl    = document.getElementById('glossaryTermArea');
  const resultBar = document.getElementById('glossarySearchResultBar');
  if (!termEl) return;
  const kwLower = kw.toLowerCase();
  let totalHit = 0, html = '';

  sorted.forEach((catObj, cidx) => {
    const colorIdx = cidx % 8;
    const terms = (catObj.terms || []).filter(t => {
      const termMatch  = (t.term || '').toLowerCase().includes(kwLower);
      const blockMatch = (t.blocks || []).some(b => {
        if (b.type === 'list') return (b.items || []).some(i => i.toLowerCase().includes(kwLower));
        return (b.text || '').toLowerCase().includes(kwLower);
      });
      return termMatch || blockMatch;
    });
    if (!terms.length) return;
    totalHit += terms.length;

    const sortedTerms = [...terms].sort((a, b) => kanaCompare(a.term, b.term));
    const itemsHtml = sortedTerms.map(t => `
      <div class="glossary-accordion-item">
        <button class="glossary-accordion-trigger" onclick="toggleGlossaryItem(this)">
          <span class="glossary-accordion-arrow">▶</span>
          <span class="glossary-term-badge" data-cidx="${colorIdx}">${escH(catObj.category)}</span>
          <span style="font-weight:700;">${highlightGlossary(escH(t.term), kw)}</span>
        </button>
        <div class="glossary-accordion-body">
          <div class="glossary-desc-inner">
            ${renderDescBlocks(t.blocks || [{ type:'body', text: t.description || '' }], kw)}
          </div>
        </div>
      </div>
    `).join('');

    html += `
      <div class="glossary-cat-heading" data-cidx="${colorIdx}">
        📋 ${escH(catObj.category)}
        <span class="glossary-cat-count">${terms.length}件ヒット</span>
      </div>
      <div class="glossary-term-list">${itemsHtml}</div>
    `;
  });

  if (resultBar) resultBar.textContent = `🔍 「${kw}」の検索結果：${totalHit}件`;
  const cnt = document.getElementById('glossarySearchCount');
  if (cnt) cnt.textContent = `${totalHit}件`;
  termEl.innerHTML = html ||
    `<div class="glossary-no-cat">「${escH(kw)}」に一致する用語が見つかりませんでした</div>`;
  document.querySelectorAll('.glossary-cat-btn').forEach(b => b.classList.remove('active'));
}

/* ════════ カテゴリタブ描画 ════════ */

function renderGlossaryCats() {
  const tabsEl = document.getElementById('glossaryCatTabs');
  const termEl = document.getElementById('glossaryTermArea');
  if (!tabsEl) return;

  const sorted = getGlossarySorted();

  if (!sorted.length) {
    tabsEl.innerHTML = '<span style="color:#888;padding:8px;display:block;">用語集データがありません</span>';
    if (termEl) termEl.innerHTML = '';
    return;
  }

  tabsEl.innerHTML = sorted.map((cat, i) => `
    <button class="glossary-cat-btn${glossarySelectedCat === cat.category ? ' active' : ''}"
            data-cidx="${i % 8}"
            onclick="selectGlossaryCat('${escH(cat.category)}')">${escH(cat.category)}</button>
  `).join('');

  if (!glossarySelectedCat || !sorted.find(c => c.category === glossarySelectedCat)) {
    glossarySelectedCat = sorted[0].category;
  }
  renderGlossaryTerms(sorted);
}

function selectGlossaryCat(catName) {
  glossarySelectedCat = catName;
  const inp = document.getElementById('glossarySearchInput');
  if (inp) inp.value = '';
  glossarySearchText = '';
  const resultBar = document.getElementById('glossarySearchResultBar');
  if (resultBar) resultBar.style.display = 'none';
  const cnt = document.getElementById('glossarySearchCount');
  if (cnt) cnt.textContent = '';
  document.querySelectorAll('.glossary-cat-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === catName);
  });
  renderGlossaryTerms(getGlossarySorted());
}

/* ════════ 用語アコーディオン ════════ */

function renderGlossaryTerms(sorted) {
  const termEl = document.getElementById('glossaryTermArea');
  if (!termEl) return;

  const cidx   = sorted.findIndex(c => c.category === glossarySelectedCat);
  const catObj = sorted[cidx];
  if (!catObj) {
    termEl.innerHTML = '<div class="glossary-no-cat">カテゴリが見つかりません</div>';
    return;
  }

  const colorIdx    = cidx % 8;
  const terms       = catObj.terms || [];
  const sortedTerms = [...terms].sort((a, b) => kanaCompare(a.term, b.term));

  const itemsHtml = sortedTerms.map(t => `
    <div class="glossary-accordion-item">
      <button class="glossary-accordion-trigger" onclick="toggleGlossaryItem(this)">
        <span class="glossary-accordion-arrow">▶</span>
        <span style="font-size:13px;font-weight:600;">${escH(t.term)}</span>
      </button>
      <div class="glossary-accordion-body">
        <div class="glossary-desc-inner">
          ${renderDescBlocks(t.blocks || [{ type:'body', text: t.description || '' }])}
        </div>
      </div>
    </div>
  `).join('');

  termEl.innerHTML = `
    <div class="glossary-cat-heading" data-cidx="${colorIdx}">
      📋 ${escH(catObj.category)}
      <span class="glossary-cat-count">${terms.length}用語</span>
    </div>
    <div class="glossary-term-list">
      ${terms.length
        ? itemsHtml
        : '<div style="padding:20px;text-align:center;color:#888;">用語が登録されていません</div>'}
    </div>
  `;
}

/* ════════ ハイライト ════════ */

function highlightGlossary(html, kw) {
  if (!kw) return html;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

/* ════════════════════════════════════════════════
   ブロック → HTML 変換
   ★ animation_html タイプを追加
════════════════════════════════════════════════ */

function renderDescBlocks(blocks, kw) {
  if (!blocks || !blocks.length) return '';
  return blocks.map(b => {
    let content = '';
    switch (b.type) {
      case 'label':
        content = `<div class="gdesc-label">${escH(b.text || '')}</div>`;
        break;
      case 'lead':
        content = `<div class="gdesc-lead">${escH(b.text || '')}</div>`;
        break;
      case 'body':
        content = `<div class="gdesc-body">${escH(b.text || '').replace(/\n/g, '<br>')}</div>`;
        break;
      case 'list': {
        const items = (b.items || []).map(i => `<li>${escH(i)}</li>`).join('');
        content = `<ul class="gdesc-list">${items}</ul>`;
        break;
      }
      case 'point':
        content = `<div class="gdesc-point">
          <span class="gdesc-point-label">📌 ${escH(b.label || 'ポイント')}</span>
          ${escH(b.text || '')}
        </div>`;
        break;
      case 'animation':
        content = renderAnimationBlock(b);
        break;
      /* ★ HTMLアニメーションブロック */
      case 'animation_html':
        content = renderAnimationHtmlBlock(b);
        break;
      default:
        content = `<div class="gdesc-body">${escH(b.text || '')}</div>`;
        break;
    }
    if (kw) content = highlightGlossary(content, kw);
    return content;
  }).join('');
}

/* ── URL系アニメーション（GIF / mp4 / YouTube） ── */
function renderAnimationBlock(b) {
  const url     = (b.text    || '').trim();
  const caption = (b.caption || '').trim();
  if (!url) return '';

  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_\-]{11})/
  );
  if (ytMatch) {
    return `<div class="gdesc-animation">
      <div class="gdesc-animation-yt-wrap">
        <iframe src="https://www.youtube.com/embed/${ytMatch[1]}"
                frameborder="0" allowfullscreen loading="lazy"
                allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture">
        </iframe>
      </div>
      ${caption ? `<div class="gdesc-animation-caption">${escH(caption)}</div>` : ''}
    </div>`;
  }
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return `<div class="gdesc-animation">
      <video class="gdesc-animation-video" controls playsinline loop muted src="${escH(url)}">
        お使いのブラウザは動画再生をサポートしていません。
      </video>
      ${caption ? `<div class="gdesc-animation-caption">${escH(caption)}</div>` : ''}
    </div>`;
  }
  return `<div class="gdesc-animation">
    <img class="gdesc-animation-img" src="${escH(url)}"
         alt="${escH(caption || 'アニメーション')}" loading="lazy">
    ${caption ? `<div class="gdesc-animation-caption">${escH(caption)}</div>` : ''}
  </div>`;
}

/**
 * ★ HTMLアニメーションブロックの表示HTML を生成する
 * b.html に記述された生HTMLコードを sandbox付き iframe で安全に表示する
 * @param {Object} b  ブロックオブジェクト { type, html, caption, height }
 * @returns {string}
 */
function renderAnimationHtmlBlock(b) {
  const rawHtml = (b.html    || b.text || '').trim();
  const caption = (b.caption || '').trim();
  /* px 単位の高さ（未指定なら 280px） */
  const height  = Number(b.height) > 0 ? Number(b.height) : 280;

  if (!rawHtml) return '';

  /*
   * セキュリティ対策:
   *   srcdoc + sandbox="allow-scripts allow-same-origin" で表示する。
   *   allow-same-origin を付けることで CSS アニメーション・Canvas・
   *   Web Animations API などが動作する。
   *   外部ネットワークへのアクセスは制限される（allow-same-origin のみ）。
   *
   * ★ rawHtml はそのままiframeのsrcdocに流し込む。
   *   管理者のみが編集できる前提のため escH はかけない。
   */
  const srcdoc = rawHtml
    /* srcdoc 内でダブルクォートが壊れないよう &quot; → " に戻す */
    .replace(/"/g, '&quot;');

  return `<div class="gdesc-animation gdesc-animation-html">
    <iframe
      class="gdesc-animation-iframe"
      srcdoc="${srcdoc}"
      sandbox="allow-scripts allow-same-origin"
      scrolling="no"
      style="height:${height}px;"
      loading="lazy"
      title="${escH(caption || 'HTMLアニメーション')}">
    </iframe>
    ${caption ? `<div class="gdesc-animation-caption">${escH(caption)}</div>` : ''}
  </div>`;
}

/* ════════ アコーディオン ════════ */

function toggleGlossaryItem(btn) {
  const body   = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');
  btn.closest('.glossary-term-list')
     .querySelectorAll('.glossary-accordion-trigger')
     .forEach(b => {
       b.classList.remove('open');
       b.nextElementSibling.classList.remove('open');
     });
  if (!isOpen) {
    btn.classList.add('open');
    body.classList.add('open');
  }
}

/* ════════ 管理エディタ ════════ */

function renderGlossaryEditor() {
  const sorted    = getGlossarySorted();
  const catListEl = document.getElementById('geCatList');
  if (!catListEl) return;

  if (!sorted.length) {
    catListEl.innerHTML = '<div class="ge-empty">カテゴリなし</div>';
    const termListEl = document.getElementById('geTermList');
    if (termListEl) termListEl.innerHTML = '<div class="ge-empty">← カテゴリを選択してください</div>';
    return;
  }

  catListEl.innerHTML = sorted.map((cat, i) => `
    <div class="ge-cat-item${geSelectedCatIdx === i ? ' active' : ''}"
         onclick="selectGeCat(${i})">
      <span class="ge-cat-dot" style="background:${GE_COLORS[i % 8]};"></span>
      <span style="flex:1;">${escH(cat.category)}</span>
      <button class="btn btn-primary btn-sm"
              onclick="event.stopPropagation();openGCatModal(${i})">✏️</button>
      <button class="btn btn-danger btn-sm"
              onclick="event.stopPropagation();deleteGCat(${i})">🗑️</button>
    </div>
  `).join('');

  renderGeTermList(sorted);
}

function selectGeCat(idx) {
  geSelectedCatIdx = idx;
  renderGlossaryEditor();
  const btn = document.getElementById('geAddTermBtn');
  if (btn) btn.disabled = false;
}

function renderGeTermList(sorted) {
  const termListEl = document.getElementById('geTermList');
  const labelEl    = document.getElementById('geTermListLabel');
  if (!termListEl) return;

  if (geSelectedCatIdx === null || geSelectedCatIdx === undefined || !sorted[geSelectedCatIdx]) {
    termListEl.innerHTML = '<div class="ge-empty">← カテゴリを選択してください</div>';
    if (labelEl) labelEl.textContent = '📝 用語一覧（カテゴリを選択）';
    return;
  }

  const cat   = sorted[geSelectedCatIdx];
  if (labelEl) labelEl.textContent = `📝 用語一覧：${cat.category}`;
  const terms = cat.terms || [];

  if (!terms.length) {
    termListEl.innerHTML = '<div class="ge-empty">用語なし</div>';
    return;
  }

  termListEl.innerHTML = terms.map((t, i) => `
    <div class="ge-term-item">
      <span class="ge-term-name">${escH(t.term)}</span>
      <button class="btn btn-primary btn-sm" onclick="openGTermModal(${i})">✏️</button>
      <button class="btn btn-danger btn-sm"  onclick="deleteGTerm(${i})">🗑️</button>
    </div>
  `).join('');
}

/* ════════ カテゴリ CRUD ════════ */

function openGCatModal(idx) {
  editingGCatIdx = (idx !== undefined) ? idx : null;
  document.getElementById('gCatModalTitle').textContent =
    editingGCatIdx !== null ? 'カテゴリ編集' : 'カテゴリ追加';
  const sorted = getGlossarySorted();
  if (editingGCatIdx !== null && sorted[editingGCatIdx]) {
    document.getElementById('gCatName').value  = sorted[editingGCatIdx].category;
    document.getElementById('gCatOrder').value = sorted[editingGCatIdx].order || 10;
  } else {
    document.getElementById('gCatName').value  = '';
    document.getElementById('gCatOrder').value = 10;
  }
  document.getElementById('gCatModal').classList.add('open');
}

async function saveGlossaryCat() {
  const name = document.getElementById('gCatName').value.trim();
  if (!name) { showToast('⚠️ カテゴリ名を入力してください'); return; }
  const order  = Number(document.getElementById('gCatOrder').value) || 10;
  const sorted = getGlossarySorted();
  if (editingGCatIdx !== null && sorted[editingGCatIdx]) {
    sorted[editingGCatIdx].category = name;
    sorted[editingGCatIdx].order    = order;
  } else {
    sorted.push({ category: name, order, terms: [] });
  }
  glossaryData = sorted;
  await saveToFirebase('glossary', glossaryData);
  closeModal('gCatModal');
  showToast('✅ カテゴリを保存しました');
  geSelectedCatIdx = null;
}

async function deleteGCat(idx) {
  if (!confirm('このカテゴリと全用語を削除しますか？')) return;
  const sorted = getGlossarySorted();
  sorted.splice(idx, 1);
  glossaryData = sorted;
  await saveToFirebase('glossary', glossaryData);
  geSelectedCatIdx = null;
  showToast('🗑️ 削除しました');
}

/* ════════ 用語 CRUD ════════ */

function openGTermModal(termIdx) {
  editingGTermIdx = (termIdx !== undefined) ? termIdx : null;
  document.getElementById('gTermModalTitle').textContent =
    editingGTermIdx !== null ? '用語編集' : '用語追加';
  const sorted = getGlossarySorted();
  const cat    = sorted[geSelectedCatIdx];
  if (editingGTermIdx !== null && cat && cat.terms[editingGTermIdx]) {
    const t = cat.terms[editingGTermIdx];
    document.getElementById('gTermName').value = t.term;
    renderDescBlockEditor(t.blocks || [{ type:'body', text: t.description || '' }]);
  } else {
    document.getElementById('gTermName').value = '';
    renderDescBlockEditor([{ type:'body', text:'' }]);
  }
  document.getElementById('gTermModal').classList.add('open');
}

async function saveGlossaryTerm() {
  const termName = document.getElementById('gTermName').value.trim();
  if (!termName)               { showToast('⚠️ 用語名を入力してください');    return; }
  if (geSelectedCatIdx === null) { showToast('⚠️ カテゴリを選択してください'); return; }
  const blocks = collectDescBlocks();
  const sorted = getGlossarySorted();
  const cat    = sorted[geSelectedCatIdx];
  if (!cat) { showToast('⚠️ カテゴリが見つかりません'); return; }
  if (!cat.terms) cat.terms = [];
  const rec = { term: termName, blocks };
  if (editingGTermIdx !== null) {
    cat.terms[editingGTermIdx] = rec;
  } else {
    cat.terms.push(rec);
  }
  glossaryData = sorted;
  await saveToFirebase('glossary', glossaryData);
  closeModal('gTermModal');
  showToast('✅ 用語を保存しました');
}

async function deleteGTerm(termIdx) {
  if (!confirm('この用語を削除しますか？')) return;
  const sorted = getGlossarySorted();
  const cat    = sorted[geSelectedCatIdx];
  if (!cat || !cat.terms) return;
  cat.terms.splice(termIdx, 1);
  glossaryData = sorted;
  await saveToFirebase('glossary', glossaryData);
  showToast('🗑️ 削除しました');
}

/* ════════════════════════════════════════════════
   ブロックエディタ
   ★ animation_html タイプの入力欄を追加
════════════════════════════════════════════════ */

function renderDescBlockEditor(blocks) {
  const container = document.getElementById('gDescBlocks');
  container.innerHTML = '';
  blocks.forEach((b, i) => container.appendChild(createDescBlockEl(b, i)));
}

/**
 * ブロック1行分の DOM 要素を生成する
 * animation_html は
 *   ① HTMLコード textarea
 *   ② キャプション input
 *   ③ 高さ(px) input
 * の3行構成
 */
function createDescBlockEl(block, idx) {
  const wrap = document.createElement('div');
  wrap.className   = 'desc-block-editor';
  wrap.dataset.idx = idx;

  const typeOpts = BLOCK_TYPES.map(({ type, label }) =>
    `<option value="${type}"${block.type === type ? ' selected' : ''}>${label}</option>`
  ).join('');

  /* メインコンテンツ入力欄 */
  const contentHtml = _buildContentHtml(block);

  /* ポイントラベル行 */
  const pointLabelHtml = block.type === 'point'
    ? `<div class="desc-block-row">
         <label>ラベル</label>
         <input type="text" class="ge-block-point-label"
                placeholder="ポイント" value="${escH(block.label || 'ポイント')}">
       </div>` : '';

  /* URL系アニメーション：キャプション行 */
  const animCaptionHtml = block.type === 'animation'
    ? `<div class="desc-block-row">
         <label>キャプション</label>
         <input type="text" class="ge-block-anim-caption"
                placeholder="説明文（省略可）" value="${escH(block.caption || '')}">
       </div>` : '';

  /* ★ HTMLアニメーション：キャプション行 ＋ 高さ行 */
  const animHtmlExtraHtml = block.type === 'animation_html'
    ? `<div class="desc-block-row">
         <label>キャプション</label>
         <input type="text" class="ge-block-anim-caption"
                placeholder="説明文（省略可）" value="${escH(block.caption || '')}">
       </div>
       <div class="desc-block-row">
         <label>高さ(px)</label>
         <input type="number" class="ge-block-anim-height" min="80" max="1200" step="10"
                placeholder="280" value="${block.height || 280}"
                style="width:90px;">
       </div>` : '';

  wrap.innerHTML = `
    <div class="desc-block-row">
      <label>種類</label>
      <select class="ge-block-type" onchange="onBlockTypeChange(this)">${typeOpts}</select>
      <button class="btn btn-danger btn-sm"
              onclick="removeDescBlock(this)" style="margin-left:auto;">✕</button>
    </div>
    ${pointLabelHtml}
    ${animCaptionHtml}
    ${animHtmlExtraHtml}
    <div class="desc-block-row"><label>内容</label>${contentHtml}</div>
  `;
  return wrap;
}

/** ブロックタイプに応じた内容入力欄HTMLを返す */
function _buildContentHtml(block) {
  switch (block.type) {
    case 'list':
      return `<textarea class="ge-block-content"
                        placeholder="1行1項目で入力">${escH((block.items || []).join('\n'))}</textarea>`;
    case 'animation':
      return `<input type="url" class="ge-block-content"
                     placeholder="URL（GIF/mp4/YouTube）"
                     value="${escH(block.text || '')}">`;
    case 'animation_html':
      /* HTML コードは textarea・高さを大きめに */
      return `<textarea class="ge-block-content ge-block-html-code"
                        placeholder="HTMLコードを入力（&lt;style&gt;タグ・&lt;canvas&gt;・CSS アニメーション等）"
                        rows="8">${escH(block.html || block.text || '')}</textarea>`;
    default:
      return `<textarea class="ge-block-content"
                        placeholder="${block.type === 'point' ? 'ポイント本文' : 'テキストを入力'}">${escH(block.text || '')}</textarea>`;
  }
}

/**
 * 種類セレクト変更時の処理
 * ★ animation_html の付加行（キャプション・高さ）に対応
 */
function onBlockTypeChange(sel) {
  const wrap = sel.closest('.desc-block-editor');
  const type = sel.value;

  /* ── ポイントラベル行 ── */
  const existingPointRow = wrap.querySelector('.ge-block-point-label')?.closest('.desc-block-row');
  if (type === 'point') {
    if (!existingPointRow) {
      const row = document.createElement('div');
      row.className = 'desc-block-row';
      row.innerHTML = `<label>ラベル</label>
        <input type="text" class="ge-block-point-label" placeholder="ポイント" value="ポイント">`;
      wrap.children[0].insertAdjacentElement('afterend', row);
    }
  } else {
    if (existingPointRow) existingPointRow.remove();
  }

  /* ── URL系アニメーション：キャプション行 ── */
  const existingAnimCapRow = wrap.querySelector('.ge-block-anim-caption')?.closest('.desc-block-row');
  if (type === 'animation' || type === 'animation_html') {
    if (!existingAnimCapRow) {
      const row = document.createElement('div');
      row.className = 'desc-block-row';
      row.innerHTML = `<label>キャプション</label>
        <input type="text" class="ge-block-anim-caption" placeholder="説明文（省略可）" value="">`;
      /* 内容行（最後）の直前に挿入 */
      wrap.appendChild(row); /* 一旦末尾に追加 → 後で内容行の前に移動 */
    }
  } else {
    if (existingAnimCapRow) existingAnimCapRow.remove();
  }

  /* ── HTMLアニメーション専用：高さ行 ── */
  const existingHeightRow = wrap.querySelector('.ge-block-anim-height')?.closest('.desc-block-row');
  if (type === 'animation_html') {
    if (!existingHeightRow) {
      const row = document.createElement('div');
      row.className = 'desc-block-row';
      row.innerHTML = `<label>高さ(px)</label>
        <input type="number" class="ge-block-anim-height" min="80" max="1200" step="10"
               placeholder="280" value="280" style="width:90px;">`;
      wrap.appendChild(row);
    }
  } else {
    if (existingHeightRow) existingHeightRow.remove();
  }

  /* ── 内容入力欄の差し替え ── */
  /* 最後の .desc-block-row が「内容」行 */
  const allRows    = wrap.querySelectorAll('.desc-block-row');
  const contentRow = allRows[allRows.length - 1];
  const oldInput   = contentRow.querySelector('.ge-block-content');
  const oldValue   = oldInput ? oldInput.value : '';

  if (type === 'animation') {
    /* URL 入力欄 */
    if (oldInput && oldInput.tagName !== 'INPUT') {
      const inp = document.createElement('input');
      inp.type = 'url'; inp.className = 'ge-block-content';
      inp.placeholder = 'URL（GIF/mp4/YouTube）'; inp.value = oldValue;
      oldInput.replaceWith(inp);
    }
  } else if (type === 'animation_html') {
    /* HTML コード textarea */
    if (oldInput && !(oldInput.tagName === 'TEXTAREA' && oldInput.classList.contains('ge-block-html-code'))) {
      const ta = document.createElement('textarea');
      ta.className = 'ge-block-content ge-block-html-code';
      ta.placeholder = 'HTMLコードを入力（<style>タグ・<canvas>・CSS アニメーション等）';
      ta.rows = 8; ta.value = oldValue;
      oldInput.replaceWith(ta);
    }
  } else if (type === 'list') {
    if (oldInput && oldInput.tagName !== 'TEXTAREA') {
      const ta = document.createElement('textarea');
      ta.className = 'ge-block-content'; ta.placeholder = '1行1項目で入力'; ta.value = oldValue;
      oldInput.replaceWith(ta);
    } else if (oldInput) { oldInput.placeholder = '1行1項目で入力'; }
  } else {
    /* 通常 textarea */
    if (oldInput && oldInput.tagName !== 'TEXTAREA') {
      const ta = document.createElement('textarea');
      ta.className = 'ge-block-content';
      ta.placeholder = type === 'point' ? 'ポイント本文' : 'テキストを入力';
      ta.value = oldValue;
      oldInput.replaceWith(ta);
    } else if (oldInput) {
      oldInput.classList.remove('ge-block-html-code');
      oldInput.placeholder = type === 'point' ? 'ポイント本文' : 'テキストを入力';
    }
  }

  /* ── キャプション行と高さ行を内容行の直前に移動 ── */
  _reorderBlockRows(wrap);
}

/**
 * ブロック内の行の順番を正規化する
 * 順番: セレクト行 → ポイントラベル → キャプション → 高さ → 内容
 */
function _reorderBlockRows(wrap) {
  const selectRow  = wrap.children[0];
  const pointRow   = wrap.querySelector('.ge-block-point-label')?.closest('.desc-block-row');
  const capRow     = wrap.querySelector('.ge-block-anim-caption')?.closest('.desc-block-row');
  const heightRow  = wrap.querySelector('.ge-block-anim-height')?.closest('.desc-block-row');
  const contentRow = wrap.querySelector('.ge-block-content')?.closest('.desc-block-row');

  /* 全行を一旦除去して正しい順で再挿入 */
  [selectRow, pointRow, capRow, heightRow, contentRow].forEach(row => {
    if (row) wrap.appendChild(row);
  });
}

function addDescBlock() {
  const container = document.getElementById('gDescBlocks');
  container.appendChild(createDescBlockEl({ type:'body', text:'' }, container.children.length));
}

function removeDescBlock(btn) {
  btn.closest('.desc-block-editor').remove();
}

/**
 * ブロックエディタから blocks 配列を収集
 * ★ animation_html は html / caption / height フィールドで保存
 */
function collectDescBlocks() {
  const blocks = [];
  document.querySelectorAll('#gDescBlocks .desc-block-editor').forEach(wrap => {
    const type    = wrap.querySelector('.ge-block-type').value;
    const content = wrap.querySelector('.ge-block-content')?.value.trim() || '';

    if (type === 'list') {
      blocks.push({
        type,
        items: content.split('\n').map(s => s.trim()).filter(Boolean)
      });
    } else if (type === 'point') {
      const labelEl = wrap.querySelector('.ge-block-point-label');
      blocks.push({ type, label: labelEl ? labelEl.value.trim() : 'ポイント', text: content });

    } else if (type === 'animation') {
      const captionEl = wrap.querySelector('.ge-block-anim-caption');
      blocks.push({
        type,
        text:    content,
        caption: captionEl ? captionEl.value.trim() : ''
      });

    } else if (type === 'animation_html') {
      /* ★ HTMLコードは html フィールドに保存 */
      const captionEl = wrap.querySelector('.ge-block-anim-caption');
      const heightEl  = wrap.querySelector('.ge-block-anim-height');
      blocks.push({
        type,
        html:    content,                                          /* HTML コード本体 */
        caption: captionEl ? captionEl.value.trim()  : '',        /* 説明文          */
        height:  heightEl  ? Number(heightEl.value) || 280 : 280  /* iframe の高さ   */
      });

    } else {
      blocks.push({ type, text: content });
    }
  });
  return blocks;
}
