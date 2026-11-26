import '@google/model-viewer';
import shapesData from './data/shapes.json';
import flowersData from './data/flowers.json';
import { analyzeReference } from './analyze.js';

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
let refs = []; // { id, url, status: 'uploading' | 'analyzing' | 'done' | 'error' }
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
// 실사 회전 영상(spins)이 있는 조합은 3D 대신 회전 프레임을 보여 준다
function loadModel(shapeId, mainFlowerId) {
  const shape = byId(shapes, shapeId);
  const variant = shape.variants?.[mainFlowerId];
  const spinCfg = shape.ready ? shape.spins?.[mainFlowerId] : null;
  const src = spinCfg ? `spin:${spinCfg.dir}` : withBase(shape.ready ? variant || shape.model : fallback);
  if (currentSrc === src) return false;
  currentSrc = src;
  loadError.hidden = true;
  loading.classList.remove('done');
  loadingBar.style.width = '0%';
  loadingText.textContent = '부케를 불러오고 있어요 · 0%';
  if (spinCfg) {
    viewer.style.visibility = 'hidden';
    loadSpin(spinCfg);
    return true;
  }
  hideSpin();
  viewer.style.visibility = '';
  viewer.orientation = shape.ready ? shape.orientation : '0deg 0deg 0deg';
  // 회전 시안을 보기 전과 같은 모델로 돌아오면 load가 다시 오지 않으니 바로 마무리한다
  if (viewer.src === src && viewer.loaded) {
    loading.classList.add('done');
    applySize(true);
    setView(currentView || 'front', true);
    captureThumb();
    return true;
  }
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
// 재질 톤: 왁스처럼 매끈한 반무광 꽃잎 + 가장자리 은은한 빛 (재질 레퍼런스 2026-11-23)
// GLB는 용량 때문에 거칠기 0.9로 줄여 두었으니, 불러온 뒤 화면에서만 부드럽게 바꾼다
// (sheen은 GLB에 KHR_materials_sheen이 있어야만 쓸 수 있어 넣지 않는다)
const SOFT_LOOK = { roughness: 0.6, glow: 0.08 };

function applySoftLook() {
  for (const m of viewer.model?.materials ?? []) {
    // 생화 재질을 GLB에 직접 넣은 모델(material 이름 live_*)은 그 설정을 그대로 쓴다
    if (m.name?.startsWith('live_')) continue;
    const pbr = m.pbrMetallicRoughness;
    pbr.setMetallicFactor(0);
    pbr.setRoughnessFactor(SOFT_LOOK.roughness);
    // 꽃잎 색을 아주 살짝 스스로 빛나게 해, 빛이 비쳐 보이는 느낌을 흉내 낸다
    const base = pbr.baseColorTexture?.texture;
    if (base) {
      m.emissiveTexture.setTexture(base);
      m.setEmissiveFactor([SOFT_LOOK.glow, SOFT_LOOK.glow, SOFT_LOOK.glow]);
    }
  }
}

viewer.addEventListener('load', async () => {
  try {
    applySoftLook();
  } catch (e) {
    console.warn('soft look skipped', e);
  }
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
/* ───────── 실사 회전 시안 (회전 영상 프레임) ───────── */
const spinBox = $('#spin');
const spinImg = $('#spin-img');
let spin = null; // { cfg, frames: [url], ready: [bool], keep: [Image], i, pos }
let spinToken = 0;

const spinActive = () => !!spin && !spinBox.hidden;
const spinUrl = (cfg, k) => withBase(`${cfg.dir}/${String(k).padStart(3, '0')}.webp`);

function hideSpin() {
  spinToken++;
  stopInertia();
  stopAutoplay();
  spin = null;
  spinBox.hidden = true;
  $('#canvas').classList.remove('plain');
  $('#canvas').style.removeProperty('--spin-bg');
  spinBox.classList.remove('blend');
}

/* 자동 회전: 영상처럼 계속 한 바퀴씩 돌고(무한 반복), 끌거나 버튼을 누르면 잠시 멈췄다가 다시 돈다
   cfg.autoplay = 한 바퀴에 걸리는 초 (원본 영상 속도) */
let autoRaf = 0;
let autoLast = 0;
let autoHoldUntil = 0;
const AUTO_RESUME_MS = 1500; // 손을 놓은 뒤 다시 돌기까지
function holdAutoplay(ms = AUTO_RESUME_MS) {
  autoHoldUntil = performance.now() + ms;
}
function stopAutoplay() {
  if (autoRaf) cancelAnimationFrame(autoRaf);
  autoRaf = 0;
}
function startAutoplay() {
  stopAutoplay();
  if (!spin?.cfg.autoplay) return;
  autoLast = performance.now();
  const tick = (now) => {
    if (!spin?.cfg.autoplay) return (autoRaf = 0);
    const dt = Math.min(now - autoLast, 50);
    autoLast = now;
    const busy = spinBox.classList.contains('dragging') || inertiaRaf || now < autoHoldUntil || reduceMotion.matches;
    if (!busy) showFrame(spin.pos + (dt / (spin.cfg.autoplay * 1000)) * spin.frames.length);
    autoRaf = requestAnimationFrame(tick);
  };
  autoRaf = requestAnimationFrame(tick);
}

// 한 바퀴를 고르게 채우는 순서: 0, n/2, n/4, 3n/4, … (반씩 쪼개기)
// 뒤쪽 프레임이 늦게 와도 끌 때 가까운 프레임으로 대신 보여 줄 수 있다
function coverOrder(n) {
  const order = [];
  const seen = new Set();
  for (let step = n; step >= 1; step = Math.floor(step / 2)) {
    for (let k = 0; k < n; k += step) if (!seen.has(k)) { seen.add(k); order.push(k); }
    if (step === 1) break;
  }
  return order;
}

function fetchFrame(url) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im));
    im.onerror = fail;
    im.src = url;
  });
}

async function loadSpin(cfg) {
  const token = ++spinToken;
  const urls = Array.from({ length: cfg.frames }, (_, k) => spinUrl(cfg, k));
  const state = { cfg, frames: urls, ready: urls.map(() => false), keep: [], i: 0, pos: 0 };
  // 첫 프레임만 오면 바로 보여 주고, 나머지는 보여 주는 동안 받는다
  const start = currentView === 'back' ? Math.floor(urls.length / 2) : 0;
  try {
    state.keep[start] = await fetchFrame(urls[start]);
    state.ready[start] = true;
  } catch {
    if (token !== spinToken) return;
    loading.classList.add('done');
    loadError.hidden = false;
    return;
  }
  if (token !== spinToken) return;
  spin = state;
  // plain: Figma 시안(301:177)처럼 흰 바탕 (배경 사진·조명 톤·그림자 없이)
  $('#canvas').classList.toggle('plain', !!cfg.plain);
  // bg: 바탕을 영상 배경색과 같게 (영상 가장자리에서 잰 색)
  $('#canvas').style.setProperty('--spin-bg', cfg.bg || '#fff');
  // blend: 누끼 없이 영상 배경째 보여 주되, 가장자리를 흰 바탕에 녹여 네모가 안 보이게
  spinBox.classList.toggle('blend', !!cfg.blend);
  spinBox.hidden = false;
  loading.classList.add('done');
  applySize();
  setView(currentView && currentView !== 'top' && currentView !== 'bottom' ? currentView : 'front');
  captureThumb();
  autoHoldUntil = 0;
  startAutoplay();

  // 나머지 프레임: 한 바퀴를 고르게 덮는 순서로, 동시에 몇 장씩
  const queue = coverOrder(urls.length).filter((k) => k !== start);
  const worker = async () => {
    while (queue.length && token === spinToken) {
      const k = queue.shift();
      try {
        state.keep[k] = await fetchFrame(urls[k]);
        state.ready[k] = true;
      } catch { /* 빠진 프레임은 이웃 프레임으로 대신 보여 준다 */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // 위에서 보기(상하 영상) 프레임: 정면(0) → 가장 위(끝). 회전 프레임을 다 받은 뒤 받는다
  if (cfg.tilt && token === spinToken) {
    const t = cfg.tilt;
    const turls = Array.from({ length: t.frames }, (_, k) => withBase(`${t.dir}/${String(k).padStart(3, '0')}.webp`));
    state.tilt = { frames: turls, ready: turls.map(() => false), keep: [] };
    const tq = coverOrder(turls.length);
    const tw = async () => {
      while (tq.length && token === spinToken) {
        const k = tq.shift();
        try {
          state.tilt.keep[k] = await fetchFrame(turls[k]);
          state.tilt.ready[k] = true;
        } catch { /* 이웃 프레임으로 대신 */ }
      }
    };
    await Promise.all(Array.from({ length: 4 }, tw));
  }
}

// 위에서 보기: t = 0(정면) ~ 1(가장 위). 받은 프레임 중 가장 가까운 걸 보여 준다
function showTilt(t) {
  const tl = spin?.tilt;
  if (!tl) return;
  const n = tl.frames.length;
  const want = Math.round(Math.max(0, Math.min(1, t)) * (n - 1));
  let k = -1;
  for (let d = 0; d < n && k < 0; d++) {
    if (tl.ready[want - d]) k = want - d;
    else if (tl.ready[want + d]) k = want + d;
  }
  if (k < 0) return;
  spin.pos = 0; // 상하 영상은 정면에서 찍었다 → 놓으면 정면에서 이어 돈다
  spin.i = -1; // 다음 showFrame이 회전 프레임으로 꼭 돌아오게
  spinImg.src = tl.frames[k];
}

// 아직 안 온 프레임이면 가장 가까운 받은 프레임을 보여 준다
function nearestReady(k) {
  const { ready } = spin;
  const n = ready.length;
  for (let d = 0; d <= n / 2; d++) {
    if (ready[(k + d) % n]) return (k + d) % n;
    if (ready[(k - d + n) % n]) return (k - d + n) % n;
  }
  return spin.i;
}

function showFrame(i) {
  const n = spin.frames.length;
  spin.pos = ((i % n) + n) % n;
  const k = nearestReady(Math.round(spin.pos) % n);
  if (k === spin.i && spinImg.getAttribute('src') === spin.frames[k]) return;
  spin.i = k;
  spinImg.src = spin.frames[k];
}

/* 손을 놓으면 끌던 속도로 조금 더 돌다가 멈춘다 (관성) */
let inertiaRaf = 0;
function stopInertia() {
  if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
  inertiaRaf = 0;
}
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const INERTIA = { minSpeed: 0.004, maxSpeed: 0.12, halfLife: 260 }; // 프레임/ms, ms

function startInertia(v) {
  stopInertia();
  if (reduceMotion.matches || Math.abs(v) < INERTIA.minSpeed * 3) return captureThumb();
  v = Math.max(-INERTIA.maxSpeed, Math.min(INERTIA.maxSpeed, v));
  let last = performance.now();
  const tick = (now) => {
    if (!spin) return (inertiaRaf = 0);
    const dt = Math.min(now - last, 50);
    last = now;
    showFrame(spin.pos + v * dt);
    v *= Math.pow(0.5, dt / INERTIA.halfLife);
    if (Math.abs(v) < INERTIA.minSpeed) {
      inertiaRaf = 0;
      return captureThumb();
    }
    inertiaRaf = requestAnimationFrame(tick);
  };
  inertiaRaf = requestAnimationFrame(tick);
}

// 끌어서 돌리기: 캔버스 너비만큼 끌면 한 바퀴
(() => {
  let startX = 0;
  let startPos = 0;
  let samples = []; // 최근 움직임 [{t, pos}] — 놓을 때 속도 계산용
  let dragId = null; // 지금 끌고 있는 포인터 (끌기 상태가 풀리지 않고 남는 일을 막는다)
  let startY = 0;
  let axis = null; // 처음 움직인 방향으로 정한다: 'x' = 좌우 회전, 'y' = 위에서 보기
  let tiltT = 0;
  let tiltRaf = 0;
  spinBox.addEventListener('pointerdown', (e) => {
    if (!spin || e.button !== 0 || dragId !== null) return;
    dragId = e.pointerId;
    stopInertia();
    if (tiltRaf) cancelAnimationFrame(tiltRaf);
    tiltRaf = 0;
    startX = e.clientX;
    startY = e.clientY;
    axis = tiltT > 0.001 ? 'y' : null; // 정면으로 돌아오는 중에 다시 잡으면 이어서 위아래로
    if (axis === 'y') startY = e.clientY + tiltT * spinBox.clientHeight * 0.45;
    startPos = spin.pos;
    samples = [{ t: e.timeStamp, pos: startPos }];
    spinBox.classList.add('dragging');
    try {
      spinBox.setPointerCapture(e.pointerId);
    } catch { /* 캡처가 안 돼도 끌기는 window pointerup으로 끝난다 */ }
  });
  spinBox.addEventListener('pointermove', (e) => {
    if (!spin || e.pointerId !== dragId) return;
    const dy = e.clientY - startY;
    if (!axis) {
      const ax = Math.abs(e.clientX - startX);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < 6) return;
      axis = ay > ax && spin.tilt ? 'y' : 'x';
      if (axis === 'y') startY = e.clientY + (tiltT * spinBox.clientHeight * 0.45); // 지금 기울기에서 이어서
    }
    if (axis === 'y') {
      // 위로 끌면 위에서 내려다본다 (캔버스 높이의 45%를 끌면 가장 위). 아래로는 정면에서 멈춘다
      tiltT = Math.max(0, Math.min(1, -(e.clientY - startY) / (spinBox.clientHeight * 0.45)));
      showTilt(tiltT);
      currentView = null;
      return;
    }
    const dx = e.clientX - startX;
    const pos = startPos - (dx / spinBox.clientWidth) * spin.frames.length;
    showFrame(pos);
    samples.push({ t: e.timeStamp, pos });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    currentView = null;
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  });
  const end = (e) => {
    if (e.pointerId !== dragId) return;
    dragId = null;
    if (spinBox.hasPointerCapture(e.pointerId)) spinBox.releasePointerCapture(e.pointerId);
    spinBox.classList.remove('dragging');
    holdAutoplay();
    if (axis === 'y') {
      // 놓으면 정면으로 부드럽게 내려온다
      axis = null;
      const back = () => {
        tiltT *= 0.86;
        if (tiltT < 0.01) {
          tiltT = 0;
          tiltRaf = 0;
          showFrame(0);
          return captureThumb();
        }
        showTilt(tiltT);
        tiltRaf = requestAnimationFrame(back);
      };
      tiltRaf = requestAnimationFrame(back);
      return;
    }
    axis = null;
    // 손을 멈춘 채 놓았으면(마지막 움직임이 오래전) 관성 없이 멈춘다
    const a = samples[0];
    const b = samples[samples.length - 1];
    const fresh = e.type === 'pointerup' && e.timeStamp - b.t < 60 && b.t - a.t > 0;
    startInertia(fresh ? (b.pos - a.pos) / (b.t - a.t) : 0);
  };
  spinBox.addEventListener('pointerup', end);
  spinBox.addEventListener('pointercancel', end);
  // 캡처를 잃거나 창 밖에서 놓아도 끌기를 끝낸다
  spinBox.addEventListener('lostpointercapture', end);
  window.addEventListener('pointerup', end);

  // 커서가 회전 영역 밖으로 나가면 기다리지 않고 바로 다시 돈다
  spinBox.addEventListener('pointerleave', () => {
    if (!spinBox.classList.contains('dragging')) autoHoldUntil = 0;
  });
})();

/* 커서 따라 보기 (참고: threeui Saltmere): 마우스를 올리면 자동 회전을 멈추고
   부케가 커서 쪽으로 실제로 돌아본다 — 좌우 = 회전 영상 프레임(±FOLLOW_DEG)
   위에서 보기는 위로 끌기가 맡으니 마우스만 올렸을 때 기울이지는 않는다
   마우스가 나가면 자동 회전을 이어 간다. 끄는 동안은 끄는 대로 돈다 */
(() => {
  const FOLLOW_DEG = 40; // 커서를 끝까지 옮기면 돌아보는 각도
  const EASE = 0.1;
  let raf = 0;
  let on = false; // 커서가 회전 영역 위에 있나
  let base = null; // 커서 가운데일 때의 프레임 위치 (끌면 다시 잡는다)
  let tgt = { nx: 0, ny: 0 };
  const cur = { nx: 0, ny: 0, pos: 0 };
  const follow = () => (spin ? (FOLLOW_DEG / 360) * spin.frames.length : 0);
  const loop = () => {
    cur.nx += (tgt.nx - cur.nx) * EASE;
    cur.ny += (tgt.ny - cur.ny) * EASE;
    let moving = Math.abs(tgt.nx - cur.nx) + Math.abs(tgt.ny - cur.ny) > 0.002;
    if (on && base !== null && spin && !spinBox.classList.contains('dragging')) {
      const want = base + cur.nx * follow();
      cur.pos += (want - cur.pos) * EASE;
      showFrame(cur.pos);
      if (Math.abs(want - cur.pos) > 0.05) moving = true;
    }
    raf = moving ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };
  const norm = (e) => {
    const r = spinBox.getBoundingClientRect();
    return {
      nx: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
      ny: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)),
    };
  };
  spinBox.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !spin || reduceMotion.matches) return;
    if (spinBox.classList.contains('dragging')) {
      base = null; // 끄는 동안은 끄는 대로. 놓은 뒤 다시 잡는다
      tgt = { nx: 0, ny: 0 };
      return kick();
    }
    const n = norm(e);
    on = true;
    if (base === null && !inertiaRaf) {
      // 지금 각도에서 시작 (놓은 뒤 관성이 끝난 다음): 커서 위치만큼 튀지 않게 기준을 거꾸로 잡는다
      cur.pos = spin.pos;
      cur.nx = n.nx;
      base = spin.pos - n.nx * follow();
    }
    autoHoldUntil = Infinity; // 커서가 있는 동안 자동 회전은 쉰다
    tgt = n;
    kick();
  });
  spinBox.addEventListener('pointerleave', () => {
    on = false;
    base = null;
    tgt = { nx: 0, ny: 0 };
    if (!spinBox.classList.contains('dragging')) autoHoldUntil = 0;
    kick();
  });
})();



$('#retry').addEventListener('click', () => {
  const src = currentSrc;
  if (src?.startsWith('spin:')) {
    const a = ver().applied;
    currentSrc = null;
    return loadModel(a.shape, a.main[0]);
  }
  viewer.src = null;
  loadError.hidden = true;
  loading.classList.remove('done');
  requestAnimationFrame(() => (viewer.src = src));
});

// 크기는 화각으로 표현한다: 스몰은 작게(넓은 화각), 라지는 크게(좁은 화각)
const SIZE_FOV = { small: 1.6, medium: 1.35, large: 1.12 };
let currentSize = null;

function applySize(jump = false) {
  // 회전 시안은 사진 배율로 크기를 보여 준다 (미디엄 = 1)
  if (currentSize) spinImg.style.transform = `scale(${(SIZE_FOV.medium / SIZE_FOV[currentSize]).toFixed(3)})`;
  if (!idealFov || !currentSize) return;
  viewer.fieldOfView = `${(idealFov * SIZE_FOV[currentSize]).toFixed(2)}deg`;
  if (jump) viewer.jumpCameraToGoal();
}

function setView(name, jump = false) {
  if (spinActive()) {
    if (name === 'top' || name === 'bottom') return toast('실사 시안은 옆으로만 돌려 볼 수 있어요');
    stopInertia();
    holdAutoplay(3000);
    showFrame(name === 'back' ? spin.frames.length / 2 : 0);
    captureThumb();
  }
  currentView = name;
  viewer.cameraOrbit = VIEWS[name];
  if (jump) viewer.jumpCameraToGoal();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}

function rotateBy(deg) {
  if (spinActive()) {
    stopInertia();
    holdAutoplay(3000);
    showFrame(spin.pos + (deg / 360) * spin.frames.length);
    currentView = null;
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    return captureThumb();
  }
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
  // 커스텀 커서: 안내 원이 보이는 동안은 기본 커서를 숨겨 원이 커서 역할을 한다
  const hide = () => {
    hint.classList.remove('show');
    canvas.classList.remove('hint-cursor');
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && !e.target.closest(UI)) hint.classList.add('grabbing');
  });
  window.addEventListener('pointerup', () => hint.classList.remove('grabbing'));
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.target.closest(UI)) return hide();
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    hint.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
    // 말풍선이 캔버스 밖으로 나가면 반대쪽으로 뒤집는다
    hint.classList.toggle('flip-x', x + 41 - 32 + tip.offsetWidth > r.width);
    hint.classList.toggle('flip-y', y + 44 - 32 + tip.offsetHeight > r.height);
    hint.classList.add('show');
    canvas.classList.add('hint-cursor');
  });
  canvas.addEventListener('pointerleave', hide);
})();

let thumbTimer;
function captureThumb() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    if (spinActive()) {
      ver().thumb = spin.frames[spin.i];
      return renderVersions();
    }
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
    else if (r.status === 'analyzing') d.innerHTML = '<div class="ov">읽는 중</div>';
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
    // Figma 285:1802: 아이콘 없이 글자 + 배지
    btn.innerHTML = `APPLY CHANGES<span class="badge" aria-hidden="true">${n}</span>`;
    btn.setAttribute('aria-label', `변경사항 ${n}개 적용하기`);
    return;
  } else {
    btn.dataset.action = 'ask';
    btn.textContent = 'ASK TO FLORIST';
  }
  btn.removeAttribute('aria-label');
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
// 3D·회전 시안 모두 다 불러오거나 실패하면 로딩 화면에 done이 붙는다
function waitModel() {
  return new Promise((resolve) => {
    if (loading.classList.contains('done')) return resolve();
    const mo = new MutationObserver(() => {
      if (!loading.classList.contains('done')) return;
      mo.disconnect();
      resolve();
    });
    mo.observe(loading, { attributes: true, attributeFilter: ['class'] });
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
  if (!spinActive() && !viewer.loaded) return toast('부케를 다 불러온 뒤에 저장할 수 있어요');
  const s = ver().applied; // 이미지는 3D에 보이는(적용된) 시안 기준
  const blob = spinActive()
    ? await fetch(spin.frames[spin.i]).then((r) => r.blob())
    : await viewer.toBlob({ mimeType: 'image/png', idealAspect: true });
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

// 분석 결과를 지금 데이터에 있는 값으로만 걸러 패널 값(draft)으로 만든다.
// 꽃은 첫 번째 꽃의 색에 맞는, 판매 중인 꽃만 최대 3종. 못 읽은 항목은 지금 값을 그대로 둔다
function patchFromAnalysis(result) {
  const patch = {};
  if (byId(shapes, result.shape)) patch.shape = result.shape;
  const pick = (ids, list, colourKey, listKey) => {
    const found = (ids || []).map((id) => byId(list, id)).filter((f) => f && f.available);
    if (!found.length) return;
    const colour = found[0].colour;
    patch[colourKey] = colour;
    patch[listKey] = found.filter((f) => f.colour === colour).slice(0, MAX_FLOWERS).map((f) => f.id);
  };
  pick(result.main, mainFlowers, 'mainColour', 'main');
  pick(result.sub, subFlowers, 'subColour', 'sub');
  return patch;
}

async function autofillFromReference(r, file) {
  r.status = 'analyzing';
  renderRefs();
  try {
    const patch = patchFromAnalysis(await analyzeReference(file));
    r.status = 'done';
    renderRefs();
    if (!Object.keys(patch).length) return toast('사진에서 모양이나 꽃을 읽지 못했어요. 직접 골라 주세요');
    const before = ver().index;
    commit(patch);
    const s = state();
    const names = s.main.map((id) => byId(mainFlowers, id).name).join(' · ');
    toast(`레퍼런스에서 채웠어요: ${byId(shapes, s.shape).label} · ${names}`, {
      label: '되돌리기',
      run: () => { ver().index = before; render(); },
    });
  } catch {
    r.status = 'done';
    renderRefs();
    toast('사진을 읽지 못했어요. 직접 골라 주세요');
  }
}

// 레퍼런스 사진 업로드: 올리면 사진을 읽어 모양·꽃을 자동으로 채운다 (3D는 APPLY CHANGES 때 반영)
$('#ref-input').addEventListener('change', (e) => {
  const err = $('#ref-error');
  err.hidden = true;
  const files = [...e.target.files];
  e.target.value = '';
  let first = null;
  for (const f of files) {
    if (refs.length >= MAX_REFS) { err.textContent = `사진은 최대 ${MAX_REFS}장까지 올릴 수 있어요.`; err.hidden = false; break; }
    if (f.size > MAX_REF_MB * 1024 * 1024) { err.textContent = `${MAX_REF_MB}MB가 넘는 사진은 올릴 수 없어요. JPG · PNG · HEIC 사진을 골라 주세요.`; err.hidden = false; continue; }
    const r = { id: crypto.randomUUID(), url: URL.createObjectURL(f), status: 'uploading' };
    refs.push(r);
    // 한 번에 여러 장을 올리면 첫 장으로 채운다
    if (!first) { first = r; setTimeout(() => autofillFromReference(r, f), 700); }
    else setTimeout(() => { r.status = 'done'; renderRefs(); }, 700);
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
