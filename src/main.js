import '@google/model-viewer';
import shapesData from './data/shapes.json';
import flowersData from './data/flowers.json';

/* ───────── 데이터 ───────── */
const { shapes, sizes, fallback } = shapesData;
const { pricing, mainColours, subColours, mainFlowers, subFlowers } = flowersData;
const MAX_FLOWERS = 3;
const MAX_REFS = 5;
const MAX_REF_MB = 20;

const DEFAULT_STATE = {
  shape: 'round',
  size: 'small',
  mainColour: 'blush',
  main: ['juliet'],
  subColour: 'ivory',
  sub: ['spray-ivory'],
  lighting: 'natural',
};

// 조명: 3D 밝기 + 캔버스 배경 톤
const LIGHTING = [
  // 배경 사진은 Figma 배경1·2·3 (style.css의 .canvas[data-light]). 3D는 노출만 맞춘다
  { id: 'natural', label: '자연광', exposure: 1.05 },
  { id: 'indoor', label: '실내광', exposure: 0.95 },
  { id: 'dim', label: '어두운 조명', exposure: 0.62 },
];
// HTML·CSS의 /assets 경로는 Vite가 빌드 때 base를 붙여 주지만, JS 문자열은 직접 붙여야 한다
const BASE = import.meta.env.BASE_URL;
const withBase = (p) => BASE + p.replace(/^\//, '');
const ICON = withBase('/assets/figma/');

const VIEWS = {
  front: '0deg 80deg auto',
  back: '180deg 80deg auto',
  top: '0deg 8deg auto',
  bottom: '0deg 168deg auto',
};

const $ = (s, el = document) => el.querySelector(s);
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
const byId = (list, id) => list.find((x) => x.id === id);

/* ───────── 상태 · 시안 버전 · 되돌리기 ───────── */
// 각 시안은 자기만의 되돌리기 기록을 가진다.
// history = 패널에서 고르는 중인 값(draft), applied = APPLY CHANGES로 3D에 반영된 값
const versions = [{ name: '시안 1', history: [structuredClone(DEFAULT_STATE)], index: 0, applied: structuredClone(DEFAULT_STATE), thumb: '' }];
let current = 0;
let refs = []; // { id, url, status: 'uploading' | 'done' | 'error' }
let lastCleared = null;

const ver = () => versions[current];
const state = () => ver().history[ver().index];

function commit(patch) {
  const next = { ...structuredClone(state()), ...patch };
  const v = ver();
  v.history = v.history.slice(0, v.index + 1);
  v.history.push(next);
  v.index = v.history.length - 1;
  render();
}

// 적용 대기 중인 변경: 모양 · 크기 · 메인(색+꽃) · 서브(색+꽃). 조명은 보기용이라 바로 반영한다
const PENDING_GROUPS = [['shape'], ['size'], ['mainColour', 'main'], ['subColour', 'sub']];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function pendingCount() {
  const s = state(), a = ver().applied;
  return PENDING_GROUPS.filter((keys) => keys.some((k) => !same(s[k], a[k]))).length;
}

function undo() { if (ver().index > 0) { ver().index--; render(); } }
function redo() { if (ver().index < ver().history.length - 1) { ver().index++; render(); } }

/* ───────── 가격 ───────── */
function avgPrice(ids, list) {
  const items = ids.map((id) => byId(list, id)).filter(Boolean);
  if (!items.length) return 0;
  return items.reduce((s, f) => s + f.price, 0) / items.length;
}
function estimate(s) {
  const total =
    pricing.base +
    pricing.filler[s.size] +
    avgPrice(s.main, mainFlowers) * pricing.mainStems[s.size] +
    avgPrice(s.sub, subFlowers) * pricing.subStems[s.size] +
    (pricing.shapeExtra[s.shape] || 0);
  return Math.round(total / 1000) * 1000;
}

/* ───────── 3D 뷰어 ───────── */
const viewer = $('#viewer');
const loading = $('#loading');
const loadingBar = $('#loading-bar');
const loadingText = $('#loading-text');
const loadError = $('#load-error');
let currentSrc = null;
let currentView = 'front';

// 모양별 기본 모델에, 첫 번째 메인 꽃 전용 모델(variants)이 있으면 그걸 쓴다
// 모델이 바뀌면 true를 돌려준다
function loadModel(shapeId, mainFlowerId) {
  const shape = byId(shapes, shapeId);
  const variant = shape.variants?.[mainFlowerId];
  const src = withBase(shape.ready ? variant || shape.model : fallback);
  if (currentSrc === src) return false;
  currentSrc = src;
  loadError.hidden = true;
  loading.classList.remove('done');
  loadingBar.style.width = '0%';
  loadingText.textContent = '부케를 불러오고 있어요 · 0%';
  viewer.orientation = shape.ready ? shape.orientation : '0deg 0deg 0deg';
  viewer.src = src;
  if (!shape.ready) toast('이 모양은 3D를 준비하고 있어요. 지금은 내추럴로 보여드려요');
  return true;
}

viewer.addEventListener('progress', (e) => {
  const pct = Math.round(e.detail.totalProgress * 100);
  loadingBar.style.width = `${pct}%`;
  loadingText.textContent = `부케를 불러오고 있어요 · ${pct}%`;
});
let idealFov = 0;
viewer.addEventListener('load', async () => {
  loading.classList.add('done');
  // 모델마다 화면에 꼭 맞는 화각을 구해 두고, 크기별로 배수를 곱한다
  viewer.fieldOfView = 'auto';
  viewer.cameraOrbit = '0deg 80deg auto';
  viewer.jumpCameraToGoal();
  await new Promise((r) => requestAnimationFrame(r));
  idealFov = viewer.getFieldOfView();
  applySize(true);
  setView(currentView || 'front', true);
  captureThumb();
});
viewer.addEventListener('error', () => {
  loading.classList.add('done');
  loadError.hidden = false;
});
$('#retry').addEventListener('click', () => {
  const src = currentSrc;
  viewer.src = null;
  loadError.hidden = true;
  loading.classList.remove('done');
  requestAnimationFrame(() => (viewer.src = src));
});

// 크기는 화각으로 표현한다: 스몰은 작게(넓은 화각), 라지는 크게(좁은 화각)
const SIZE_FOV = { small: 1.6, medium: 1.35, large: 1.12 };
let currentSize = null;

function applySize(jump = false) {
  if (!idealFov || !currentSize) return;
  viewer.fieldOfView = `${(idealFov * SIZE_FOV[currentSize]).toFixed(2)}deg`;
  if (jump) viewer.jumpCameraToGoal();
}

function setView(name, jump = false) {
  currentView = name;
  viewer.cameraOrbit = VIEWS[name];
  if (jump) viewer.jumpCameraToGoal();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}

function rotateBy(deg) {
  const o = viewer.getCameraOrbit();
  viewer.cameraOrbit = `${(o.theta * 180) / Math.PI + deg}deg ${(o.phi * 180) / Math.PI}deg ${o.radius}m`;
  currentView = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

viewer.addEventListener('camera-change', (e) => {
  if (e.detail.source === 'user-interaction') {
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }
});

// 회전 안내(원 + 말풍선)가 캔버스 안에서 마우스 커서를 따라다닌다.
// 버튼·툴바·시안 위에서는 숨기고, 터치 기기(마우스 없음)에서는 쓰지 않는다
(() => {
  const canvas = $('#canvas');
  const hint = $('#drag-hint');
  const tip = hint.querySelector('.hint-tooltip');
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const UI = 'button, a, input, .toolbar, .versions, .canvas-arrow, .toast, .state-error';
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.target.closest(UI)) return hint.classList.remove('show');
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    hint.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
    // 말풍선이 캔버스 밖으로 나가면 반대쪽으로 뒤집는다
    hint.classList.toggle('flip-x', x + 41 - 32 + tip.offsetWidth > r.width);
    hint.classList.toggle('flip-y', y + 44 - 32 + tip.offsetHeight > r.height);
    hint.classList.add('show');
  });
  canvas.addEventListener('pointerleave', () => hint.classList.remove('show'));
})();

let thumbTimer;
function captureThumb() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    if (!viewer.loaded) return;
    try {
      ver().thumb = viewer.toDataURL('image/png');
      renderVersions();
    } catch { /* 캡처 실패는 무시 */ }
  }, 500);
}

/* ───────── 렌더 ───────── */
function radio(el, checked) { el.setAttribute('role', 'radio'); el.setAttribute('aria-checked', String(checked)); }

function renderShapes(s) {
  const box = $('#shape-options');
  box.innerHTML = '';
  shapes.forEach((sh) => {
    const b = document.createElement('button');
    b.className = 'opt' + (sh.ready ? '' : ' soon');
    b.innerHTML = sh.label + (sh.ready ? '' : '<span class="tag">준비 중</span>');
    b.title = sh.description;
    radio(b, s.shape === sh.id);
    b.onclick = () => s.shape !== sh.id && commit({ shape: sh.id });
    box.append(b);
  });
}

function renderSizes(s) {
  const box = $('#size-options');
  box.innerHTML = '';
  Object.entries(sizes).forEach(([id, sz]) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = `${sz.label}<small>${sz.stems}</small>`;
    radio(b, s.size === id);
    b.onclick = () => s.size !== id && commit({ size: id });
    box.append(b);
  });
}

function renderSwatches(boxId, colours, selected, key, listKey, flowerList) {
  const box = $(boxId);
  box.innerHTML = '';
  colours.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.innerHTML = `<i style="background:${c.swatch}"></i>`;
    b.setAttribute('aria-label', c.label);
    b.title = c.label;
    radio(b, selected === c.id);
    b.onclick = () => {
      if (selected === c.id) return;
      // 색을 바꾸면 그 색의 첫 번째 '있는' 꽃을 기본으로 고른다
      const first = flowerList.find((f) => f.colour === c.id && f.available);
      commit({ [key]: c.id, [listKey]: first ? [first.id] : [] });
    };
    box.append(b);
  });
}

function renderFlowers(boxId, list, colour, selected, listKey) {
  const box = $(boxId);
  box.innerHTML = '';
  const items = list.filter((f) => f.colour === colour);
  if (!items.some((f) => f.available)) {
    box.innerHTML = '<div class="empty"><p class="label">이번 주엔 이 색의 꽃이 없어요</p><p class="help-sm">비슷한 색을 고르거나, 플로리스트에게 물어볼 수 있어요.</p></div>';
    return;
  }
  items.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'flower';
    b.disabled = !f.available;
    b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', String(selected.includes(f.id)));
    b.innerHTML = `<span class="flower-info">
        <span class="flower-thumb"><img src="${ICON}flower-thumb.png" width="24" height="24" alt="" /></span>
        <span class="flower-text"><span class="name">${f.name}</span><span class="meta">${f.available ? `1송이 ${won(f.price)}부터~` : '판매 시즌이 아니에요'}</span></span>
      </span>
      <span class="check" aria-hidden="true"><img src="${ICON}check.svg" width="18" height="18" alt="" /></span>`;
    b.onclick = () => {
      const on = selected.includes(f.id);
      if (on && selected.length === 1) return toast('꽃은 1종 이상 골라 주세요');
      if (!on && selected.length >= MAX_FLOWERS) return toast(`꽃은 ${MAX_FLOWERS}종까지 고를 수 있어요`);
      commit({ [listKey]: on ? selected.filter((x) => x !== f.id) : [...selected, f.id] });
    };
    box.append(b);
  });
}

function flowerSummary(s) {
  const first = byId(mainFlowers, s.main[0]);
  const rest = s.main.length - 1 + s.sub.length;
  const chips = [byId(mainColours, s.mainColour), byId(subColours, s.subColour)]
    .map((c) => `<span class="chip"><i style="background:${c.swatch}"></i></span>`).join('');
  return `<span class="summary-chips">${chips}</span><span>${first ? first.name : '꽃 없음'}${rest > 0 ? ` + ${rest}` : ''}</span>`;
}

function renderLighting(s) {
  const box = $('#lighting-options');
  box.innerHTML = '';
  LIGHTING.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.textContent = l.label;
    radio(b, s.lighting === l.id);
    b.onclick = () => s.lighting !== l.id && commit({ lighting: l.id });
    box.append(b);
  });
  const l = byId(LIGHTING, s.lighting);
  viewer.exposure = l.exposure;
  $('#canvas').dataset.light = l.id;
}

// 모바일: 패널 아래 '고른 값' 칩 (244:2661). 칩을 누르면 그 섹션으로, ⊗를 누르면 그 값을 지운다
function renderChoices(s) {
  const box = $('#choice-bar');
  box.innerHTML = '';
  const items = [
    { label: byId(shapes, s.shape).label, section: 'shape', clear: () => commit({ shape: DEFAULT_STATE.shape }) },
    { label: sizes[s.size].label, section: 'size', clear: () => commit({ size: DEFAULT_STATE.size }) },
    { label: byId(mainColours, s.mainColour).label, section: 'flowers', clear: () => commit({ mainColour: DEFAULT_STATE.mainColour, main: [...DEFAULT_STATE.main] }) },
    ...s.main.map((id) => ({ label: byId(mainFlowers, id).name, section: 'flowers', clear: () => removeFlower('main', id) })),
    { label: byId(subColours, s.subColour).label, section: 'flowers', clear: () => commit({ subColour: DEFAULT_STATE.subColour, sub: [...DEFAULT_STATE.sub] }) },
    ...s.sub.map((id) => ({ label: byId(subFlowers, id).name, section: 'flowers', clear: () => removeFlower('sub', id) })),
    { label: byId(LIGHTING, s.lighting).label, section: 'lighting', clear: () => commit({ lighting: DEFAULT_STATE.lighting }) },
  ];
  items.forEach((it) => {
    const chip = document.createElement('span');
    chip.className = 'choice';
    const go = document.createElement('button');
    go.textContent = it.label;
    go.onclick = () => openSection(it.section);
    const x = document.createElement('button');
    x.setAttribute('aria-label', `${it.label} 지우기`);
    x.innerHTML = `<img src="${ICON}chip-close.svg" width="16" height="16" alt="" />`;
    x.onclick = it.clear;
    chip.append(go, x);
    box.append(chip);
  });
}

function removeFlower(listKey, id) {
  const list = state()[listKey];
  if (list.length === 1) return toast('꽃은 1종 이상 골라 주세요');
  commit({ [listKey]: list.filter((x) => x !== id) });
}

function openSection(name) {
  const sec = document.querySelector(`[data-section="${name}"]`);
  const head = sec?.querySelector('.acc-head');
  if (head && head.getAttribute('aria-expanded') === 'false') head.click();
  sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderVersions() {
  const box = $('#version-list');
  box.innerHTML = '';
  versions.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'version';
    b.setAttribute('aria-pressed', String(i === current));
    b.innerHTML = `<span class="thumb-img" style="background-image:${v.thumb ? `url(${v.thumb})` : 'none'}"></span>${v.name}`;
    b.onclick = () => { if (i !== current) { current = i; render(); } };
    box.append(b);
  });
  if (versions.length < 3) {
    const add = document.createElement('button');
    add.className = 'version-add';
    add.innerHTML = `<img src="${ICON}plus-small.svg" width="12" height="12" alt="" />`;
    add.setAttribute('aria-label', '지금 시안을 복제해서 새 시안 만들기');
    add.title = '시안 복제해서 비교';
    add.onclick = () => {
      versions.push({ name: `시안 ${versions.length + 1}`, history: [structuredClone(state())], index: 0, applied: structuredClone(ver().applied), thumb: ver().thumb });
      current = versions.length - 1;
      render();
      toast(`${ver().name}를 만들었어요. 바꿔 보고 비교해 보세요`);
    };
    box.append(add);
  }
}

function renderRefs() {
  const box = $('#ref-thumbs');
  box.innerHTML = '';
  refs.forEach((r) => {
    const d = document.createElement('div');
    d.className = 'thumb' + (r.status === 'done' ? ' done' : '');
    d.style.backgroundImage = `url(${r.url})`;
    if (r.status === 'uploading') d.innerHTML = '<div class="ov">올리는 중</div><div class="mini"><i></i></div>';
    else {
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.setAttribute('aria-label', '이 사진 지우기');
      del.onclick = () => { refs = refs.filter((x) => x !== r); URL.revokeObjectURL(r.url); renderRefs(); updateClear(); };
      d.append(del);
    }
    box.append(d);
    if (r.status === 'uploading') requestAnimationFrame(() => { const i = d.querySelector('.mini i'); if (i) i.style.width = '100%'; });
  });
  if (refs.length < MAX_REFS) {
    const add = document.createElement('button');
    add.className = 'thumb-add';
    add.innerHTML = `<img src="${ICON}plus-small.svg" width="12" height="12" alt="" />`;
    add.setAttribute('aria-label', '사진 더 올리기');
    add.onclick = () => $('#ref-input').click();
    box.append(add);
  }
}

function isDefault(s) { return JSON.stringify(s) === JSON.stringify(DEFAULT_STATE); }
function updateClear() { $('[data-action="clear"]').disabled = isDefault(state()) && refs.length === 0; }

function render() {
  const s = state();
  renderShapes(s);
  renderSizes(s);
  renderSwatches('#main-colours', mainColours, s.mainColour, 'mainColour', 'main', mainFlowers);
  renderSwatches('#sub-colours', subColours, s.subColour, 'subColour', 'sub', subFlowers);
  renderFlowers('#main-flowers', mainFlowers, s.mainColour, s.main, 'main');
  renderFlowers('#sub-flowers', subFlowers, s.subColour, s.sub, 'sub');

  $('#main-colour-label').textContent = byId(mainColours, s.mainColour).label;
  $('#sub-colour-label').textContent = byId(subColours, s.subColour).label;
  const typeCount = (list, colourId, colours) =>
    `${byId(colours, colourId).label.split(' ').pop()} ${list.filter((f) => f.colour === colourId).length} types`;
  $('#main-count').textContent = typeCount(mainFlowers, s.mainColour, mainColours);
  $('#sub-count').textContent = typeCount(subFlowers, s.subColour, subColours);

  $('[data-summary="shape"]').textContent = byId(shapes, s.shape).label;
  $('[data-summary="size"]').textContent = sizes[s.size].label;
  $('[data-summary="flowers"]').innerHTML = flowerSummary(s);
  $('[data-summary="lighting"]').textContent = byId(LIGHTING, s.lighting).label;
  renderLighting(s);
  renderChoices(s);

  // 3D는 적용된 값만 보여준다: 모양 + 첫 번째 메인 꽃 → 모델, 크기 → 배율
  showApplied();
  renderEstimate();

  $('[data-action="undo"]').disabled = ver().index === 0;
  $('[data-action="redo"]').disabled = ver().index === ver().history.length - 1;
  updateClear();
  renderVersions();
  captureThumb();
}

/* ───────── 견적 · 변경사항 적용 (285:1793) ───────── */
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
const ICON_SPIN = '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".3"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
let applyPhase = null; // null | 'loading' | 'done'

// 크기는 카메라 거리로 표현한다 (스몰은 멀리, 라지는 가깝게). 모델이 바뀌면 true
function showApplied() {
  const a = ver().applied;
  const changed = loadModel(a.shape, a.main[0]);
  if (currentSize !== a.size) { currentSize = a.size; applySize(); }
  return changed;
}

function renderEstimate() {
  const now = estimate(state());
  const before = estimate(ver().applied);
  const n = pendingCount();
  $('#price').textContent = won(now);
  const b = $('#price-before');
  b.hidden = n === 0 || before === now;
  b.textContent = won(before);

  const btn = $('#primary-action');
  btn.disabled = applyPhase === 'loading';
  btn.toggleAttribute('aria-busy', applyPhase === 'loading');
  if (applyPhase === 'loading') {
    btn.dataset.action = '';
    btn.innerHTML = `${ICON_SPIN}APPLYING`;
  } else if (applyPhase === 'done') {
    btn.dataset.action = '';
    btn.innerHTML = `${ICON_CHECK}APPLIED`;
  } else if (n > 0) {
    btn.dataset.action = 'apply';
    btn.innerHTML = `${ICON_REFRESH}APPLY CHANGES<span class="badge" aria-hidden="true">${n}</span>`;
    btn.setAttribute('aria-label', `변경사항 ${n}개 적용하기`);
    return;
  } else {
    btn.dataset.action = 'ask';
    btn.textContent = 'ASK TO FLORIST';
  }
  btn.removeAttribute('aria-label');
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
function waitModel() {
  return new Promise((resolve) => {
    const done = () => { viewer.removeEventListener('load', done); viewer.removeEventListener('error', done); resolve(); };
    viewer.addEventListener('load', done);
    viewer.addEventListener('error', done);
  });
}

async function applyChanges() {
  if (applyPhase || pendingCount() === 0) return;
  const v = ver();
  v.applied = structuredClone(state());
  applyPhase = 'loading';
  renderEstimate();
  const status = $('#apply-status');
  status.textContent = '변경사항을 적용하고 있어요';
  // 모델이 바뀌면 다 불러올 때까지, 크기만 바뀌면 카메라가 움직일 시간만 기다린다
  if (showApplied()) await waitModel();
  else { await nextFrame(); await new Promise((r) => setTimeout(r, 450)); }
  captureThumb();
  applyPhase = 'done';
  renderEstimate();
  status.textContent = '변경사항을 적용했어요';
  setTimeout(() => { applyPhase = null; renderEstimate(); }, 1200);
}

/* ───────── 토스트 ───────── */
let toastTimer;
function toast(text, action) {
  const t = $('#toast');
  t.innerHTML = '';
  t.append(text);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 5000 : 3000);
}

/* ───────── 이벤트 ───────── */
// 아코디언
// 접기·펼치기: Figma 닫힌 상태(240:3160)처럼 제목 옆에 고른 값을 요약하고 − / + 아이콘을 바꾼다
document.querySelectorAll('.acc-head').forEach((h) =>
  h.addEventListener('click', () => {
    const open = h.getAttribute('aria-expanded') !== 'true';
    h.setAttribute('aria-expanded', String(open));
    const t = h.querySelector('.section-title');
    if (t.dataset.openTitle) t.textContent = open ? t.dataset.openTitle : t.dataset.closedTitle;
  }),
);

// 탭
document.querySelectorAll('[role="tab"]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role="tab"]').forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
  }),
);

// 캔버스 · 툴바 · 견적 버튼
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.view) return setView(btn.dataset.view);
  switch (btn.dataset.action) {
    case 'menu': return toggleMenu();
    case 'panel': return togglePanel();
    case 'undo': return undo();
    case 'redo': return redo();
    case 'rotate-left': return rotateBy(-90);
    case 'rotate-right': return rotateBy(90);
    case 'hand': return toast('손에 든 모습은 손 모델을 준비하고 있어요');
    case 'ask': return toast('플로리스트에게 보내기는 다음 단계에서 연결돼요');
    case 'apply': return applyChanges();
    case 'download': return downloadImage();
    case 'clear': return ($('#clear-modal').hidden = false);
    case 'clear-cancel': return ($('#clear-modal').hidden = true);
    case 'clear-confirm': return clearAll();
  }
});

function toggleMenu(force) {
  const gnb = $('#gnb');
  const open = force ?? !gnb.classList.contains('menu-open');
  gnb.classList.toggle('menu-open', open);
  $('[data-action="menu"]').setAttribute('aria-expanded', String(open));
}

function togglePanel(force) {
  const panel = $('#panel');
  const open = force ?? !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  document.body.classList.toggle('panel-open', open);
  const btn = $('[data-action="panel"]');
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? '부케 설정 닫기' : '부케 설정 열기');
}

// 화면이 넓어지면 모바일 패널·메뉴 상태를 정리한다
matchMedia('(min-width: 860px)').addEventListener('change', (e) => { if (e.matches) togglePanel(false); });
matchMedia('(min-width: 1440px)').addEventListener('change', (e) => { if (e.matches) toggleMenu(false); });

function clearAll() {
  $('#clear-modal').hidden = true;
  lastCleared = { state: structuredClone(state()), applied: structuredClone(ver().applied), refs: [...refs] };
  refs = [];
  renderRefs();
  // 모두 지우기는 3D에도 바로 반영한다
  ver().applied = structuredClone(DEFAULT_STATE);
  commit(structuredClone(DEFAULT_STATE));
  toast('모두 지웠어요', {
    label: '되돌리기',
    run: () => { refs = lastCleared.refs; renderRefs(); ver().applied = lastCleared.applied; commit(lastCleared.state); },
  });
}

async function downloadImage() {
  if (!viewer.loaded) return toast('부케를 다 불러온 뒤에 저장할 수 있어요');
  const s = ver().applied; // 이미지는 3D에 보이는(적용된) 시안 기준
  const blob = await viewer.toBlob({ mimeType: 'image/png', idealAspect: true });
  const img = await createImageBitmap(blob);
  const pad = 140;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height + pad;
  const g = c.getContext('2d');
  g.fillStyle = '#fffef2'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  g.fillStyle = '#16100e';
  g.font = '600 28px Pretendard, sans-serif';
  const names = [...s.main.map((id) => byId(mainFlowers, id).name), ...s.sub.map((id) => byId(subFlowers, id).name)];
  g.fillText(`${byId(shapes, s.shape).label} · ${sizes[s.size].label} · ${names.join(', ')}`, 40, img.height + 56);
  g.font = '400 24px Pretendard, sans-serif';
  g.fillStyle = '#8a7f78';
  g.fillText(`(예상) ${won(estimate(s))} · 꽃 시세에 따라 조금 달라질 수 있어요 · FLORENCE FLOWER`, 40, img.height + 100);
  const a = document.createElement('a');
  a.download = `florence-${ver().name.replace(' ', '')}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
  toast('시안 이미지를 저장했어요');
}

// 레퍼런스 사진 업로드 (프로토타입: 브라우저 안에서만 보관)
$('#ref-input').addEventListener('change', (e) => {
  const err = $('#ref-error');
  err.hidden = true;
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) {
    if (refs.length >= MAX_REFS) { err.textContent = `사진은 최대 ${MAX_REFS}장까지 올릴 수 있어요.`; err.hidden = false; break; }
    if (f.size > MAX_REF_MB * 1024 * 1024) { err.textContent = `${MAX_REF_MB}MB가 넘는 사진은 올릴 수 없어요. JPG · PNG · HEIC 사진을 골라 주세요.`; err.hidden = false; continue; }
    const r = { id: crypto.randomUUID(), url: URL.createObjectURL(f), status: 'uploading' };
    refs.push(r);
    setTimeout(() => { r.status = 'done'; renderRefs(); }, 700);
  }
  renderRefs();
  updateClear();
});

// 키보드: ← → 회전
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, [role="dialog"]')) return;
  if (e.key === 'ArrowLeft' && e.target === document.body) rotateBy(-15);
  if (e.key === 'ArrowRight' && e.target === document.body) rotateBy(15);
  if (e.key === 'Escape') { $('#clear-modal').hidden = true; togglePanel(false); toggleMenu(false); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
});

renderRefs();
render();
