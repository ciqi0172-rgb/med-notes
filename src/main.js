const els = {
  stats: document.querySelector('#stats'),
  searchShell: document.querySelector('#searchShell'),
  search: document.querySelector('#searchInput'),
  clear: document.querySelector('#clearButton'),
  resultBadge: document.querySelector('#resultBadge'),
  searchPanel: document.querySelector('#searchPanel'),
  resultCount: document.querySelector('#resultCount'),
  searchHelp: document.querySelector('#searchHelp'),
  closeResults: document.querySelector('#closeResults'),
  results: document.querySelector('#resultsList'),
  content: document.querySelector('#documentContent'),
  sidebar: document.querySelector('#sidebar'),
  sidebarToggle: document.querySelector('#sidebarToggle'),
  sidebarClose: document.querySelector('#sidebarClose'),
  outlineNav: document.querySelector('#outlineNav'),
  drawerBackdrop: document.querySelector('#drawerBackdrop'),
  currentSection: document.querySelector('#currentSection'),
  currentHeading: document.querySelector('#currentHeading'),
  backTop: document.querySelector('#backTop'),
};

const state = {
  index: null,
  blocks: [],
  section: '全部',
  matches: [],
  targetTimer: 0,
  sidebarOpen: false,
  sidebarCloseFocus: null,
  activeOutlineId: '',
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileSidebar = window.matchMedia('(max-width: 900px)');
const MAX_RENDERED_RESULTS = 80;

init().catch(showLoadError);

async function init() {
  const [indexResponse, contentResponse] = await Promise.all([
    fetch('./assets/search-index.json'),
    fetch('./assets/content.html'),
  ]);

  if (!indexResponse.ok) throw new Error(`search-index.json: ${indexResponse.status}`);
  if (!contentResponse.ok) throw new Error(`content.html: ${contentResponse.status}`);

  const index = await indexResponse.json();
  const html = await contentResponse.text();

  state.index = index;
  state.blocks = index.blocks || [];
  els.content.innerHTML = html;

  renderStats();
  renderOutline();
  bindEvents();
  syncSidebarMode();
  runSearch();
  updateCurrentHeading();

  if (location.hash.length > 1) {
    window.setTimeout(() => jumpToBlock(location.hash.slice(1), { updateHash: false }), 80);
  }
}

function showLoadError(error) {
  console.error(error);
  els.stats.textContent = '文档载入失败';
  els.searchPanel.hidden = true;
  els.content.innerHTML = `
    <p class="load-error">正文或索引没有载入成功。
      <button class="retry-button" id="retryLoad" type="button">重新载入</button>
    </p>`;
  document.querySelector('#retryLoad').addEventListener('click', () => location.reload());
}

function renderStats() {
  const meta = state.index.meta;
  els.stats.textContent = `${meta.characters.toLocaleString('zh-CN')} 字符 · ${meta.blocks.toLocaleString('zh-CN')} 个段落 · ${meta.headings} 个章节。按 / 搜索，Enter 定位首条。`;
}

function renderOutline() {
  // count chapters under each level-1 subject first
  const counts = [];
  let current = -1;
  for (const item of state.index.outline) {
    if (item.level === 1) {
      counts.push(0);
      current += 1;
    } else if (current >= 0) {
      counts[current] += 1;
    }
  }

  let html = '';
  let groupOpen = false;
  let groupIndex = -1;

  for (const item of state.index.outline) {
    if (item.level === 1) {
      if (groupOpen) html += '</div>';
      groupIndex += 1;
      html += `
      <div class="outline-group">
        <button class="outline-h1" type="button" data-toggle-group data-section="${escapeAttr(item.section)}"
                aria-expanded="false" aria-label="展开 ${escapeAttr(item.title)} 的 ${counts[groupIndex]} 个章节">
          <span class="outline-h1-text">${escapeHTML(item.title)}</span>
          <span class="outline-count">${counts[groupIndex]} 章</span>
          <span class="outline-caret" aria-hidden="true">▸</span>
        </button>`;
      groupOpen = true;
    } else {
      html += `
        <a class="outline-h2" href="#${escapeAttr(item.id)}" data-target="${escapeAttr(item.id)}"
           data-section="${escapeAttr(item.section)}" hidden>
          ${escapeHTML(item.title)}
        </a>`;
    }
  }
  if (groupOpen) html += '</div>';
  els.outlineNav.innerHTML = html;
}

function setGroupExpanded(group, expanded) {
  const toggle = group.querySelector('[data-toggle-group]');
  toggle.setAttribute('aria-expanded', String(expanded));
  group.querySelectorAll('.outline-h2').forEach((link) => {
    link.hidden = !expanded;
  });
}

function expandSection(section) {
  const toggle = els.outlineNav.querySelector(`[data-toggle-group][data-section="${CSS.escape(section)}"]`);
  if (toggle) setGroupExpanded(toggle.closest('.outline-group'), true);
}

function bindEvents() {
  let searchTimer = 0;

  els.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 100);
  });
  els.search.addEventListener('focus', () => {
    if (els.search.value.trim()) setSearchPanel(true);
  });
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      runSearch();
      jumpToFirstResult();
    }
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    runSearch();
    clearHighlights();
    els.search.focus();
  });

  els.closeResults.addEventListener('click', () => setSearchPanel(false));

  document.addEventListener('pointerdown', (event) => {
    const insideSearch = event.target.closest('#searchShell, #searchPanel');
    const resultItem = event.target.closest('.result-item');
    if (!insideSearch && !resultItem && !els.searchPanel.hidden) setSearchPanel(false);
  });

  els.results.addEventListener('click', (event) => {
    const button = event.target.closest('.result-item');
    if (button) jumpToBlock(button.dataset.target);
  });

  els.outlineNav.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-group]');
    if (toggle) {
      const group = toggle.closest('.outline-group');
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      setGroupExpanded(group, expanded);
      return;
    }
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    closeSidebar(false);
    jumpToBlock(link.dataset.target);
  });

  els.sidebarToggle.addEventListener('click', openSidebar);
  els.sidebarClose.addEventListener('click', () => closeSidebar());
  els.drawerBackdrop.addEventListener('click', () => closeSidebar());
  mobileSidebar.addEventListener('change', syncSidebarMode);

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !isEditable(event.target)) {
      event.preventDefault();
      els.search.focus();
      if (els.search.value.trim()) setSearchPanel(true);
    }
    if (event.key === 'Escape') {
      if (!els.searchPanel.hidden) {
        setSearchPanel(false);
        els.search.focus();
      } else if (state.sidebarOpen) {
        closeSidebar();
      }
    }
  });

  els.backTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateBackTop();
      updateCurrentHeading();
      ticking = false;
    });
  }, { passive: true });

  updateBackTop();
}

function syncSidebarMode() {
  if (mobileSidebar.matches) {
    els.sidebarToggle.setAttribute('aria-expanded', String(state.sidebarOpen));
    if (state.sidebarOpen) {
      document.body.classList.add('sidebar-locked');
      els.sidebar.inert = false;
      els.sidebar.classList.add('is-open');
      els.drawerBackdrop.hidden = false;
      requestAnimationFrame(() => els.drawerBackdrop.classList.add('is-open'));
    } else {
      document.body.classList.remove('sidebar-locked');
      els.sidebar.inert = true;
      els.sidebar.classList.remove('is-open');
      els.drawerBackdrop.classList.remove('is-open');
      window.setTimeout(() => {
        if (!state.sidebarOpen) els.drawerBackdrop.hidden = true;
      }, reducedMotion ? 0 : 180);
    }
  } else {
    state.sidebarOpen = false;
    els.sidebar.inert = false;
    els.sidebar.classList.add('is-open');
    els.sidebar.classList.remove('sidebar-locked');
    els.drawerBackdrop.classList.remove('is-open');
    els.drawerBackdrop.hidden = true;
    document.body.classList.remove('sidebar-locked');
    els.sidebarToggle.setAttribute('aria-expanded', 'true');
  }
}

function openSidebar() {
  if (!mobileSidebar.matches) return;
  state.sidebarCloseFocus = document.activeElement;
  state.sidebarOpen = true;
  syncSidebarMode();
  els.sidebarClose.focus();
}

function closeSidebar(restoreFocus = true) {
  if (!mobileSidebar.matches) return;
  state.sidebarOpen = false;
  syncSidebarMode();
  if (restoreFocus && state.sidebarCloseFocus?.focus) state.sidebarCloseFocus.focus();
}

function setSearchPanel(open) {
  els.searchPanel.hidden = !open;
  els.searchPanel.setAttribute('aria-hidden', String(!open));
}

function runSearch() {
  const terms = parseQuery(els.search.value);
  clearHighlights();

  if (!terms.length) {
    state.matches = [];
    els.resultCount.textContent = '0';
    els.resultBadge.textContent = '';
    els.searchHelp.textContent = '输入关键词后显示匹配段落。';
    els.results.innerHTML = '';
    setSearchPanel(false);
    return;
  }

  const matches = [];
  for (const block of state.blocks) {
    if (state.section !== '全部' && block.s !== state.section) continue;
    const score = scoreBlock(block, terms);
    if (score !== null) matches.push({ ...block, score: score.score, first: score.first });
  }

  matches.sort((a, b) => b.score - a.score || a.first - b.first || a.id.localeCompare(b.id));
  state.matches = matches;

  const countText = matches.length.toLocaleString('zh-CN');
  els.resultCount.textContent = countText;
  els.resultBadge.textContent = countText;

  if (!matches.length) {
    els.searchHelp.textContent = `没有找到“${els.search.value.trim()}”。可以减少关键词，或切换资料范围。`;
    els.results.innerHTML = '';
    setSearchPanel(true);
    return;
  }

  els.searchHelp.textContent = matches.length > MAX_RENDERED_RESULTS
    ? `找到 ${countText} 条，下面显示最相关的前 ${MAX_RENDERED_RESULTS} 条。`
    : `找到 ${countText} 条，点击结果跳转到原文。`;

  const html = matches.slice(0, MAX_RENDERED_RESULTS).map((item) => {
    const type = item.k.startsWith('h') ? item.k.toUpperCase() : '段落';
    return `
      <button class="result-item" type="button" data-target="${escapeAttr(item.id)}">
        <span class="result-meta">${escapeHTML(item.s)} · ${type}</span>
        <span class="result-title">${highlightText(item.h, terms)}</span>
        <span class="result-snippet">${highlightText(makeSnippet(item.x, terms), terms)}</span>
      </button>`;
  }).join('');

  els.results.innerHTML = html + (matches.length > MAX_RENDERED_RESULTS
    ? `<div class="results-footer">继续输入更精确的关键词可缩小范围。</div>`
    : '');
  setSearchPanel(true);
}

function parseQuery(value) {
  const terms = [];
  let rest = value.trim();
  rest = rest.replace(/["“]([^"”]+)["”]/g, (_, phrase) => {
    const normalized = normalizeText(phrase);
    if (normalized) terms.push(normalized);
    return ' ';
  });
  for (const part of rest.split(/\s+/)) {
    const normalized = normalizeText(part);
    if (normalized) terms.push(normalized);
  }
  return [...new Set(terms)];
}

function scoreBlock(block, terms) {
  const text = normalizeText(block.x);
  const heading = normalizeText(block.h);
  const section = normalizeText(block.s);
  let first = Number.POSITIVE_INFINITY;
  let score = 0;

  for (const term of terms) {
    const textIndex = text.indexOf(term);
    const headingIndex = heading.indexOf(term);
    const sectionIndex = section.indexOf(term);
    if (textIndex < 0 && headingIndex < 0 && sectionIndex < 0) return null;

    const found = [textIndex, headingIndex, sectionIndex].filter((index) => index >= 0);
    first = Math.min(first, ...found);
    score += term.length * 4;
    if (headingIndex >= 0) score += 36;
    if (sectionIndex >= 0) score += 18;
  }

  if (block.k.startsWith('h')) score += 28;
  return { score, first };
}

function makeSnippet(text, terms) {
  const lower = normalizeText(text);
  const positions = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const first = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, first - 28);
  const end = Math.min(text.length, first + 110);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function jumpToFirstResult() {
  const first = state.matches[0];
  if (first) jumpToBlock(first.id);
}

function jumpToBlock(id, options = {}) {
  const { updateHash = true } = options;
  const target = document.getElementById(id);
  if (!target) return;

  clearHighlights();
  window.clearTimeout(state.targetTimer);
  target.classList.add('is-target');
  highlightInElement(target, parseQuery(els.search.value));
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

  if (updateHash) history.replaceState(null, '', `#${id}`);
  setSearchPanel(false);
  updateReaderContext(id);
  state.targetTimer = window.setTimeout(() => target.classList.remove('is-target'), 1800);
}

function highlightInElement(root, terms) {
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('mark, script, style')) return NodeFilter.FILTER_REJECT;
      const text = normalizeText(node.nodeValue);
      return terms.some((term) => text.includes(term)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => highlightTextNode(node, terms));
}

function highlightTextNode(textNode, terms) {
  const original = textNode.nodeValue;
  const lower = normalizeText(original);
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  while (cursor < original.length) {
    let nearestIndex = -1;
    let nearestTerm = '';
    for (const term of terms) {
      const index = lower.indexOf(term, cursor);
      if (index >= 0 && (nearestIndex < 0 || index < nearestIndex || (index === nearestIndex && term.length > nearestTerm.length))) {
        nearestIndex = index;
        nearestTerm = term;
      }
    }
    if (nearestIndex < 0) {
      fragment.append(document.createTextNode(original.slice(cursor)));
      break;
    }
    if (nearestIndex > cursor) fragment.append(document.createTextNode(original.slice(cursor, nearestIndex)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = original.slice(nearestIndex, nearestIndex + nearestTerm.length);
    fragment.append(mark);
    cursor = nearestIndex + nearestTerm.length;
  }

  textNode.replaceWith(fragment);
}

function clearHighlights() {
  els.content.querySelectorAll('.doc-block.is-target').forEach((block) => block.classList.remove('is-target'));
  els.content.querySelectorAll('mark.search-hit').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
}

function highlightText(value, terms) {
  const lower = normalizeText(value);
  let cursor = 0;
  let html = '';

  while (cursor < value.length) {
    let nearestIndex = -1;
    let nearestTerm = '';
    for (const term of terms) {
      const index = lower.indexOf(term, cursor);
      if (index >= 0 && (nearestIndex < 0 || index < nearestIndex || (index === nearestIndex && term.length > nearestTerm.length))) {
        nearestIndex = index;
        nearestTerm = term;
      }
    }
    if (nearestIndex < 0) {
      html += escapeHTML(value.slice(cursor));
      break;
    }
    html += escapeHTML(value.slice(cursor, nearestIndex));
    const matchedText = value.slice(nearestIndex, nearestIndex + nearestTerm.length);
    html += `<mark class="search-hit">${escapeHTML(matchedText)}</mark>`;
    cursor = nearestIndex + nearestTerm.length;
  }

  return html;
}

function updateBackTop() {
  els.backTop.classList.toggle('is-visible', window.scrollY > 700);
}

function updateCurrentHeading() {
  const items = state.index?.outline || [];
  if (!items.length) return;

  let active = items[0];
  for (const item of items) {
    const target = document.getElementById(item.id);
    if (!target) continue;
    if (target.getBoundingClientRect().top <= window.innerHeight * 0.28) active = item;
    else break;
  }

  if (active.id !== state.activeOutlineId) {
    state.activeOutlineId = active.id;
    els.outlineNav.querySelectorAll('a[data-target]').forEach((link) => {
      link.setAttribute('aria-current', String(link.dataset.target === active.id));
    });
    els.currentSection.textContent = active.section;
    els.currentHeading.textContent = active.title;
  }
}

function updateReaderContext(id) {
  const target = document.getElementById(id);
  const items = state.index?.outline || [];
  if (!target || !items.length) return;

  let active = items[0];
  for (const item of items) {
    const heading = document.getElementById(item.id);
    if (!heading) continue;
    if (heading.getBoundingClientRect().top <= target.getBoundingClientRect().top + 1) active = item;
    else break;
  }

  state.activeOutlineId = active.id;
  els.currentSection.textContent = active.section;
  els.currentHeading.textContent = active.title;
  els.outlineNav.querySelectorAll('a[data-target]').forEach((link) => {
    link.setAttribute('aria-current', String(link.dataset.target === active.id));
  });
  expandSection(active.section);
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('zh-CN');
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function isEditable(element) {
  return element instanceof HTMLElement && (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}
