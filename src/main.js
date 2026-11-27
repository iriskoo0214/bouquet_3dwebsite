import '@google/model-viewer';
import shapesData from './data/shapes.json';
import flowersData from './data/flowers.json';
import { analyzeReference, checkFlowerPhoto, warmUpFlowerCheck } from './analyze.js';

/* ───────── 데이터 ───────── */
const { shapes, sizes, fallback } = shapesData;
const { pricing, mainColours, subColours, mainFlowers, subFlowers } = flowersData;
const MAX_FLOWERS = 3;
const MAX_REFS = 5;
const MAX_REF_MB = 20;

// 처음 화면은 회전 영상 속 부케와 같게: 내추럴 · 카라 화이트 + 스위트피
// 크기는 영상이 원래 크기로 보이는 미디엄
const DEFAULT_STATE = {
  shape: 'natural',
  size: 'medium',
  mainColour: 'white',
  main: ['calla-white'],
  subColour: 'lavender',
  sub: ['sweetpea'],
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
// 스튜디오 조명: 왼쪽 위 따뜻한 키라이트 + 뒤쪽 차가운 백라이트 + 하늘·땅 반사광을 구운 HDR
// (tools/studio_env.py로 만든다. 경로에 배포 base가 붙어야 해서 HTML이 아니라 여기서 지정)
const STUDIO_ENV = withBase('/env/studio.hdr');

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
// 처음에는 3D에 아무것도 없다(applied = null): 레퍼런스 사진을 올리거나 APPLY CHANGES를 눌러야 부케가 보인다
const versions = [{ name: '시안 1', history: [structuredClone(DEFAULT_STATE)], index: 0, applied: null, thumb: '' }];
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
  const s = state(), a = ver().applied || DEFAULT_STATE;
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
viewer.environmentImage = STUDIO_ENV;
const loading = $('#loading');
const loadingBar = $('#loading-bar');
const loadingText = $('#loading-text');
const loadError = $('#load-error');
let currentSrc = null;
let currentView = 'front';

// 모양별 기본 모델에, 첫 번째 메인 꽃 전용 모델(variants)이 있으면 그걸 쓴다
// 모델이 바뀌면 true를 돌려준다
// 실사 회전 영상: 조합 전용(spins) → 모양 전용(shape.spin) → 모든 모양·꽃에 공통 회전 영상(spin) 순으로 고른다
const { spin: defaultSpin } = shapesData;
function loadModel(shapeId, mainFlowerId) {
  const shape = byId(shapes, shapeId);
  const variant = shape.variants?.[mainFlowerId];
  const spinCfg = shape.spins?.[mainFlowerId] || shape.spin || defaultSpin || null;
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
  if (tiltRaf) cancelAnimationFrame(tiltRaf);
  tiltRaf = 0;
  tiltT = 0;
  spin = null;
  spinBox.hidden = true;
  $('#canvas').classList.remove('plain', 'still');
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
    const busy = spinBox.classList.contains('dragging') || inertiaRaf || tiltT > 0 || tiltRaf || now < autoHoldUntil || reduceMotion.matches;
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
  // 사진 한 장(돌지 않는 시안): 끌기·회전 안내 없이 보여 준다
  $('#canvas').classList.toggle('still', cfg.frames < 2);
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

// 위에서 보기 정도: 0 = 정면(회전 영상), 1 = 가장 위. 위로 끌기와 '위' 버튼이 같이 쓴다
let tiltT = 0;
let tiltRaf = 0;
function tiltTo(to, done) {
  if (tiltRaf) cancelAnimationFrame(tiltRaf);
  const step = () => {
    tiltT += (to - tiltT) * 0.14;
    if (Math.abs(to - tiltT) < 0.01) {
      tiltT = to;
      tiltRaf = 0;
      if (to === 0) showFrame(0);
      else showTilt(to);
      return done?.();
    }
    showTilt(tiltT);
    tiltRaf = requestAnimationFrame(step);
  };
  tiltRaf = requestAnimationFrame(step);
}

// 끌어서 돌리기: 캔버스 너비만큼 끌면 한 바퀴
(() => {
  let startX = 0;
  let startPos = 0;
  let samples = []; // 최근 움직임 [{t, pos}] — 놓을 때 속도 계산용
  let dragId = null; // 지금 끌고 있는 포인터 (끌기 상태가 풀리지 않고 남는 일을 막는다)
  let startY = 0;
  let axis = null; // 처음 움직인 방향으로 정한다: 'x' = 좌우 회전, 'y' = 위에서 보기
  spinBox.addEventListener('pointerdown', (e) => {
    if (!spin || spin.frames.length < 2 || e.button !== 0 || dragId !== null) return;
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

/* 마우스를 올려도 자동 회전은 멈추지 않는다 (예전 '커서 따라 보기'는 뺐다). 끌면 끄는 대로 돈다 */

$('#retry').addEventListener('click', () => {
  const src = currentSrc;
  if (src?.startsWith('spin:')) {
    const a = ver().applied;
    currentSrc = null;
    return a && loadModel(a.shape, a.main[0]);
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
    if (name === 'bottom') return hint($('[data-view="bottom"]'), '아래에서 본 모습은 아직 없어요');
    if (name === 'top' && !spin.tilt) return hint($('[data-view="top"]'), '위에서 본 모습은 아직 없어요');
    stopInertia();
    if (name === 'top') {
      // 정면으로 돌린 뒤 위로 올라가 내려다본다. 다른 버튼을 누르거나 끌 때까지 그대로 둔다
      holdAutoplay(Infinity);
      if (!tiltT) showFrame(0);
      tiltTo(1, captureThumb);
    } else {
      holdAutoplay(3000);
      const frame = name === 'back' ? spin.frames.length / 2 : 0;
      if (tiltT || tiltRaf) tiltTo(0, () => { showFrame(frame); captureThumb(); });
      else { showFrame(frame); captureThumb(); }
    }
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
    // 빈 캔버스·돌지 않는 사진 위에서는 돌릴 게 없으니 안내도, 커서 숨김도 하지 않는다
    if (e.pointerType !== 'mouse' || e.target.closest(UI) || canvas.matches('.is-blank, .still')) return hide();
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
    fillBox(`shape:${sh.id}`, b, s.shape === sh.id, 'opt');
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
    fillBox(`size:${id}`, b, s.size === id, 'opt');
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
        <span class="flower-thumb"><img src="${f.thumb ? withBase(f.thumb) : `${ICON}flower-thumb.png`}" width="24" height="24" alt="" /></span>
        <span class="flower-text"><span class="name">${f.name}</span><span class="meta">${f.available ? `1송이 ${won(f.price)}부터~` : '판매 시즌이 아니에요'}</span></span>
      </span>
      <span class="check" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M3 8.59L7.97 13.5L15 4.5" pathLength="1"/></svg></span>`;
    drawCheck(`${listKey}:${f.id}`, b.querySelector('.check path'), selected.includes(f.id));
    fillBox(`${listKey}:${f.id}`, b.querySelector('.check'), selected.includes(f.id), 'check');
    b.onclick = () => {
      const on = selected.includes(f.id);
      if (on && selected.length === 1) return toast('꽃은 1종 이상 골라 주세요');
      if (!on && selected.length >= MAX_FLOWERS) return toast(`꽃은 ${MAX_FLOWERS}종까지 고를 수 있어요`);
      commit({ [listKey]: on ? selected.filter((x) => x !== f.id) : [...selected, f.id] });
    };
    box.append(b);
  });
}

/* 체크 표시가 스스로 그려진다 — designbookmark 'Checkbox list'의 체크 모션 (스프링 160 · 20).
   체크하면 0.08초 뒤 선이 왼쪽부터 그려지고, 해제하면 거꾸로 지워진다.
   목록은 고를 때마다 새로 그려서, 꽃마다 스프링을 따로 보관해 이어서 움직인다 */
const checkMarks = new Map(); // 'main:calla-white' → { s, on, path, timer }
function drawCheck(key, path, on) {
  let m = checkMarks.get(key);
  if (!m) {
    m = { s: Springs.S(on ? 1 : 0, 160, 20), on };
    checkMarks.set(key, m);
  }
  m.path = path;
  if (m.on !== on) {
    m.on = on;
    clearTimeout(m.timer);
    if (on) m.timer = setTimeout(() => { if (m.on) { m.s.t = 1; Springs.kick(); } }, 80);
    else { m.s.t = 0; Springs.kick(); }
  }
  path.style.strokeDashoffset = (1 - clamp01(m.s.x)).toFixed(3);
}

/* 고르면 상자가 검게 차오른다 — designbookmark 'Checkbox list'의 채우기 모션 (스프링 300 · 24, 원본 값).
   원본의 크기가 톡 튀는 효과는 쓰지 않는다.
   움직이는 동안만 인라인 색을 쓰고, 멈추면 지워서 CSS(hover 등)가 그대로 적용된다 */
const boxFills = new Map();
const FILL_KIND = {
  check: { border: ['--color-bg-inverse', '--color-border-default'], text: null },
  opt: { border: ['--color-border-strong', '--color-border-default'], text: ['--color-text-on-inverse', '--color-text-primary'] },
};
function fillBox(key, el, on, kind) {
  let m = boxFills.get(key);
  if (!m) {
    m = { f: Springs.S(on ? 1 : 0, 300, 24), on, kind: FILL_KIND[kind] };
    boxFills.set(key, m);
  }
  m.el = el;
  if (m.on !== on) {
    m.on = on;
    m.f.t = on ? 1 : 0;
    Springs.kick();
  }
  paintFill(m);
}
function paintFill(m) {
  const el = m.el;
  if (!el?.isConnected) return;
  const settled = Math.abs(m.f.x - m.f.t) < 1e-3 && Math.abs(m.f.v) < 1e-2;
  if (settled) { el.style.background = el.style.borderColor = el.style.color = ''; return; }
  const pct = (clamp01(m.f.x) * 100).toFixed(1);
  const mix = ([a, b]) => `color-mix(in srgb, var(${a}) ${pct}%, var(${b}))`;
  el.style.background = `color-mix(in srgb, var(--color-bg-inverse) ${pct}%, transparent)`;
  el.style.borderColor = mix(m.kind.border);
  if (m.kind.text) el.style.color = mix(m.kind.text);
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
    fillBox(`light:${l.id}`, b, s.lighting === l.id, 'opt');
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
  $('#canvas').classList.toggle('is-blank', !a);
  if (!a) return showEmpty();
  const changed = loadModel(a.shape, a.main[0]);
  if (currentSize !== a.size) { currentSize = a.size; applySize(); }
  return changed;
}

// 빈 캔버스: 영상·3D·불러오기 표시를 모두 숨긴다
// 바탕은 회전 영상들과 같은 단색 (내추럴 #d7d8d6 · 라운드 #e1dfe0의 중간)
const BLANK_BG = '#dcdbdb';
function showEmpty() {
  if (currentSrc === 'empty') return false;
  currentSrc = 'empty';
  hideSpin();
  $('#canvas').classList.add('plain');
  $('#canvas').style.setProperty('--spin-bg', BLANK_BG);
  viewer.style.visibility = 'hidden';
  loadError.hidden = true;
  loading.classList.add('done');
  return false;
}

function renderEstimate() {
  const now = estimate(state());
  const before = estimate(ver().applied || state());
  const n = pendingCount();
  $('#price').textContent = won(now);
  const b = $('#price-before');
  b.hidden = n === 0 || before === now;
  b.textContent = won(before);

  const btn = $('#primary-action');
  if (applyPhase) cancelRollOut(btn);
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
    setApplyLabel(btn, n, true);
    btn.setAttribute('aria-label', `변경사항 ${n}개 적용하기`);
    renderPanelApply(n);
    return;
  } else {
    btn.dataset.action = 'ask';
    // 변경이 0개로 줄면: 숫자가 0까지 굴러 내려간 뒤 ASK TO FLORIST로 바뀐다
    if (!applyPhase && rollOut(btn, () => { btn.innerHTML = '<span class="swap-in">ASK TO FLORIST</span>'; fadeInText(btn.firstChild); })) { /* 굴러가는 중 */ }
    else if (!btn._rollOut) btn.textContent = 'ASK TO FLORIST';
  }
  btn.removeAttribute('aria-label');
  renderPanelApply(n);
}

// 모바일 패널 아래 APPLY CHANGES (305:444): 적용할 변경이 있을 때만 보인다
function renderPanelApply(n) {
  const b = $('#panel-apply');
  const hideIt = () => { b.hidden = true; b.textContent = ''; }; // 다시 나타날 때 0에서 시작하도록 비운다
  if (n > 0 && !applyPhase) { b.hidden = false; setApplyLabel(b, n, true); }
  else if (applyPhase) { cancelRollOut(b); hideIt(); }
  else if (!rollOut(b, hideIt) && !b._rollOut) hideIt(); // 0이 되면 굴러 내려간 뒤 숨긴다
  b.setAttribute('aria-label', `변경사항 ${n}개 적용하고 3D로 보기`);
}

/* APPLY CHANGES 옆 숫자가 바뀔 때 굴러가듯 바뀐다 — Kokonut UI 'Cart button'의 RollingText와 같은 움직임
   (MIT, kokonutui.com). 자리마다 따로 움직이고, 늘면 새 숫자가 아래 12px에서 올라오며 옛 숫자는 위로 빠진다
   (줄면 반대). 0.24초, ease-out cubic-bezier(0.23, 1, 0.32, 1). 움직임 줄이기 설정이면 바로 바뀐다 */
const ROLL_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
function setApplyLabel(btn, n, animate) {
  cancelRollOut(btn);
  let rolls = btn.querySelector('.badge .rolls');
  if (!rolls) {
    // 버튼이 막 APPLY CHANGES로 바뀐 때도 0에서 굴러 올라온다
    btn.innerHTML = 'APPLY CHANGES<span class="badge" aria-hidden="true"><span class="rolls"></span></span>';
    rolls = btn.querySelector('.badge .rolls');
    rollNumber(rolls, 0, false);
    animate = true;
  }
  rollNumber(rolls, n, animate && !reduceMotion.matches);
}
// 숫자를 0까지 굴려 내린 뒤 then()을 부른다. 굴릴 숫자가 없으면 false
function rollOut(btn, then) {
  const rolls = btn.querySelector('.badge .rolls');
  if (!rolls || Number(rolls.dataset.n) <= 0 || reduceMotion.matches || btn.hidden) return false;
  rollNumber(rolls, 0, true);
  btn._rollOut = setTimeout(() => { btn._rollOut = 0; then(); }, 320);
  return true;
}
function cancelRollOut(btn) { clearTimeout(btn._rollOut); btn._rollOut = 0; }
function fadeInText(el) {
  if (!reduceMotion.matches) el.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: ROLL_EASE });
}

function rollNumber(box, n, animate) {
  const prev = Number(box.dataset.n ?? n);
  const dir = n >= prev ? 1 : -1;
  box.dataset.n = n;
  const text = String(n);
  const slots = new Map([...box.children].map((s) => [Number(s.dataset.place), s]));
  for (let i = 0; i < text.length; i++) {
    const place = text.length - i; // 오른쪽부터 센 자리
    let slot = slots.get(place);
    slots.delete(place);
    if (!slot) { slot = document.createElement('span'); slot.className = 'roll'; slot.dataset.place = place; }
    box.append(slot); // 순서 맞추기
    const cur = slot.querySelector(':scope > span:not(.out)');
    if (cur && cur.textContent === text[i]) continue;
    const next = document.createElement('span');
    next.textContent = text[i];
    slot.append(next);
    if (cur) {
      cur.classList.add('out');
      if (animate) {
        cur.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-12 * dir}px)`, opacity: 0 }],
          { duration: 240, easing: ROLL_EASE, fill: 'forwards' }).finished.then(() => cur.remove(), () => cur.remove());
      } else cur.remove();
    }
    if (animate && cur) {
      next.animate([{ transform: `translateY(${12 * dir}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 240, easing: ROLL_EASE });
    }
  }
  slots.forEach((s) => s.remove()); // 줄어든 자리
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

// force: 바뀐 게 없어도 적용한다 (빈 캔버스에 레퍼런스 결과를 바로 보여 줄 때)
async function applyChanges(force = false) {
  if (applyPhase || (!force && pendingCount() === 0 && ver().applied)) return;
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
    case 'hand': return toggleHand();
    case 'ask': return hint(btn, '플로리스트에게 보내기는 다음 단계에서 연결돼요');
    case 'apply': return applyChanges();
    case 'panel-apply': togglePanel(false); return applyChanges(); // 패널을 닫고 3D에서 적용되는 걸 보여 준다
    case 'download': return downloadImage();
    case 'clear': return ($('#clear-modal').hidden = false);
    case 'clear-cancel': return ($('#clear-modal').hidden = true);
    case 'clear-confirm': return clearAll();
  }
});

/* ───────── 메뉴 (1439px 이하): ☰ 누르면 아래로 펼쳐진다 ─────────
   designbookmark 'Dynamic menu'(아이콘)와 'Sidebar collapse'(펼침)의 스프링을 그대로 쓴다.
   Sidebar collapse는 옆으로 펼쳐지지만 여기서는 같은 움직임을 세로로 돌렸다:
   - 높이: stiffness 260 · damping 24 (원본 너비 스프링)
   - 메뉴 글자: 300 · 26. 열 때는 0.06초 뒤부터 0.04초 간격으로 차례로, 닫을 때는 한꺼번에
   - 마우스를 올리면 바탕 없이 글자만 진해진다 (CSS)
   - ☰ → X: 380 · 24 (Dynamic menu)
   움직임 줄이기 설정이면 튕김 없이(임계 감쇠) 멈춘다 */
const Springs = (() => {
  const list = [];
  let raf = 0, last = 0;
  const S = (x, k, c) => {
    const s = { x, v: 0, t: x, k, c: reduceMotion.matches ? 2 * Math.sqrt(k) : c };
    list.push(s);
    return s;
  };
  const renders = [];
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    for (let i = 0; i < 4; i++) { // 프레임마다 4번 나눠 계산 (원본 motion.js와 같음)
      const h = dt / 4;
      list.forEach((s) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * h; s.x += s.v * h; });
    }
    const busy = list.some((s) => Math.abs(s.x - s.t) > 1e-3 || Math.abs(s.v) > 1e-2);
    if (!busy) list.forEach((s) => { s.x = s.t; s.v = 0; });
    renders.forEach((r) => r());
    raf = busy ? requestAnimationFrame(frame) : 0;
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const drop = (s) => { const i = list.indexOf(s); if (i > -1) list.splice(i, 1); };
  return { S, kick, drop, onRender: (r) => renders.push(r) };
})();
function clamp01(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
Springs.onRender(() => {
  checkMarks.forEach((m) => { if (m.path?.isConnected) m.path.style.strokeDashoffset = (1 - clamp01(m.s.x)).toFixed(3); });
  boxFills.forEach(paintFill);
});

const menuUI = (() => {
  const gnb = $('#gnb');
  const nav = $('#gnb-menu');
  const bars = document.querySelectorAll('.burger i');
  const links = [...nav.querySelectorAll('a')];

  const compact = matchMedia('(max-width: 1439px)');
  const X = Springs.S(0, 380, 24);
  const H = Springs.S(0, 260, 24);
  const labels = links.map(() => Springs.S(0, 300, 26));
  let timers = [];
  const fullHeight = () => nav.scrollHeight + 1; // + 아래 테두리 1px

  function set(open) {
    timers.forEach(clearTimeout); timers = [];
    X.t = open ? 1 : 0;
    H.t = open ? fullHeight() : 0;
    if (open) {
      labels.forEach((l, i) => timers.push(setTimeout(() => { l.t = 1; Springs.kick(); }, (0.06 + i * 0.04) * 1000)));
    } else {
      labels.forEach((l) => { l.t = 0; });
    }
    Springs.kick();
  }

  Springs.onRender(() => {
    const x = clamp01(X.x, -0.1, 1.1);
    bars[0].style.transform = `translateY(${(-4 * (1 - x)).toFixed(2)}px) rotate(${(45 * x).toFixed(2)}deg)`;
    bars[1].style.transform = `translateY(${(4 * (1 - x)).toFixed(2)}px) rotate(${(-45 * x).toFixed(2)}deg)`;
    if (!compact.matches) return;
    const h = Math.max(0, H.x);
    nav.style.height = h.toFixed(2) + 'px';
    nav.style.visibility = h < 0.5 && H.t === 0 ? 'hidden' : 'visible';
    links.forEach((a, i) => {
      const o = clamp01(labels[i].x);
      a.style.opacity = o.toFixed(3);
      a.style.transform = `translateY(${((1 - o) * -10).toFixed(2)}px)`;
    });
  });

  // 넓은 화면(1440 이상)에서는 가로 메뉴라 스프링이 손대지 않는다
  function reset() {
    [nav, ...links].forEach((el) => el.removeAttribute('style'));
  }
  compact.addEventListener('change', () => { reset(); if (compact.matches) Springs.kick(); });
  if (compact.matches) Springs.kick();
  return { set };
})();

/* HAND 토글의 눈 아이콘 — designbookmark 'Password strength'의 눈 모션 (스프링 300 · 24).
   켜면 빗금이 지워지며 눈동자가 커지고, 끄면 빗금이 그어지며 눈동자가 반으로 줄어든다 */
const handEye = (() => {
  const btn = document.querySelector('.tb-hand');
  const slash = btn.querySelector('.eye-slash');
  const pupil = btn.querySelector('.eye-pupil');
  const E = Springs.S(0, 300, 24);
  Springs.onRender(() => {
    const e = clamp01(E.x);
    slash.style.strokeDashoffset = e.toFixed(3);
    pupil.style.transform = `scale(${(0.5 + 0.5 * e).toFixed(3)})`;
  });
  return { set(on) { E.t = on ? 1 : 0; Springs.kick(); } };
})();
function toggleHand() {
  const btn = $('[data-action="hand"]');
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', String(on));
  handEye.set(on);
  if (on) hint(btn, '손에 든 모습은 손 모델을 준비하고 있어요');
}

/* ───────── 아직 없는 기능 안내 툴팁 ─────────
   designbookmark 'Morph tooltip'의 움직임. 눌린 버튼 위에 말풍선이 뜨고, 다른 버튼을 누르면
   사라지지 않고 그쪽으로 늘어나며 옮겨 가 새 글 폭에 맞춰 멈춘다. 말풍선 꼬리 없음, 툴바(또는 버튼) 위 12px.
   - 나타나기 420 · 24 (72% 크기, 6px 아래에서)
   - 가는 쪽 가장자리 620 · 36, 반대쪽 190 · 19 → 늘어났다가 따라붙는다
   - 세로 위치 300 · 22 (원본 꼬리 값). 꼬리는 쓰지 않는다
   - 글자 420 · 32: 옛 글은 온 쪽으로 빠지고 새 글은 반대쪽에서 14px 미끄러져 들어온다 (살짝 흐림)
   2.4초 뒤 또는 다른 곳을 누르면 사라진다 */
let hintUI;
function hint(target, text) {
  if (!target) return toast(text);
  hintUI ??= makeHint();
  hintUI.show(target, text);
}
function makeHint() {
  const LEAD = [620, 36], TRAIL = [190, 19];
  const tune = (s, [k, c]) => { s.k = k; s.c = reduceMotion.matches ? 2 * Math.sqrt(k) : c; };
  const tip = document.createElement('div');
  tip.className = 'hint';
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-live', 'polite');
  document.body.append(tip);

  const TL = Springs.S(0, ...LEAD), TR = Springs.S(0, ...LEAD), TY = Springs.S(0, 300, 22);
  const A = Springs.S(0, 420, 24);
  let labs = []; // { el, o, dir }
  let cur = null, hideTimer = 0;

  function show(target, text) {
    const r = target.getBoundingClientRect();
    // 툴바 안 버튼이면 툴바 테두리에서, 아니면 버튼에서 12px 위에 띄운다
    const edge = (target.closest('.toolbar') ?? target).getBoundingClientRect().top;
    const cx = r.left + r.width / 2, top = edge - 12;
    const lab = document.createElement('span');
    lab.className = 'hint-lab';
    lab.textContent = text;
    tip.append(lab);
    const w = lab.offsetWidth;
    const half = w / 2;
    const fresh = A.x < 0.3;
    const dir = fresh || !cur ? 0 : Math.sign(cx - cur.cx);
    if (!fresh) {
      tune(TR, dir >= 0 ? LEAD : TRAIL);
      tune(TL, dir >= 0 ? TRAIL : LEAD);
    }
    [[TL, cx - half], [TR, cx + half], [TY, top]].forEach(([s, v]) => { s.t = v; if (fresh) { s.x = v; s.v = 0; } });
    const o = Springs.S(fresh ? 1 : 0, 420, 32);
    labs.forEach((l) => { l.o.t = 0; l.dir = -dir; });
    labs.push({ el: lab, o, dir });
    o.t = 1;
    cur = { target, cx };
    A.t = 1;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 2400);
    Springs.kick();
  }
  function hide() { clearTimeout(hideTimer); A.t = 0; Springs.kick(); }
  // 다른 곳을 누르거나 화면이 움직이면 닫는다
  document.addEventListener('pointerdown', (e) => { if (A.t && cur && !cur.target.contains(e.target)) hide(); }, true);
  addEventListener('resize', hide);
  document.addEventListener('scroll', hide, true);

  Springs.onRender(() => {
    const a = clamp01(A.x, 0, 1.15), op = clamp01(A.x);
    const vw = document.documentElement.clientWidth;
    const l0 = Math.min(TL.x, TR.x - 30), w = TR.x - l0;
    const l = clamp01(l0, 8, Math.max(8, vw - 8 - w)); // 화면 안에 머문다
    tip.style.width = w.toFixed(2) + 'px';
    tip.style.opacity = op.toFixed(3);
    tip.style.transform = `translate(${l.toFixed(2)}px, ${(TY.x - 34 + (1 - a) * 6).toFixed(2)}px) scale(${(0.72 + 0.28 * a).toFixed(4)})`;
    labs = labs.filter((lb) => {
      const o = clamp01(lb.o.x);
      if (lb.o.t === 0 && o < 0.01) { lb.el.remove(); Springs.drop(lb.o); return false; }
      lb.el.style.opacity = o.toFixed(3);
      lb.el.style.transform = `translateX(calc(-50% + ${(lb.dir * (1 - o) * 14).toFixed(2)}px))`;
      lb.el.style.filter = o > 0.02 && o < 0.98 ? `blur(${((1 - o) * 3).toFixed(2)}px)` : 'none';
      return true;
    });
    tip.style.visibility = op < 0.01 && A.t === 0 ? 'hidden' : 'visible';
    if (op < 0.01 && A.t === 0) cur = null;
  });
  return { show, hide };
}

function toggleMenu(force) {
  const gnb = $('#gnb');
  const open = force ?? !gnb.classList.contains('menu-open');
  gnb.classList.toggle('menu-open', open);
  const btn = $('[data-action="menu"]');
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  menuUI.set(open);
}

// 필터 아이콘 ↔ X (메뉴 아이콘과 같은 스프링 380/24)
const panelIcon = (() => {
  const lines = document.querySelectorAll('.filter-x .fx-line');
  const knobs = document.querySelectorAll('.filter-x .fx-knob');
  const knobAt = [[14.17, 5], [5.83, 10], [9.17, 15]];
  const X = Springs.S(0, 380, 24);
  Springs.onRender(() => {
    const x = clamp01(X.x, -0.1, 1.1);
    const k = clamp01(x);
    // 위·아래 줄: 가운데로 모이며 ±45° 돌고, X 길이만큼 늘어난다
    [[0, -5, 45], [2, 5, -45]].forEach(([i, dy, deg]) => {
      lines[i].setAttribute('transform', `translate(10 10) rotate(${(deg * x).toFixed(2)}) translate(0 ${(dy * (1 - x)).toFixed(2)}) scale(${(1 + 0.32 * x).toFixed(3)} 1)`);
    });
    // 가운데 줄은 가로로 줄어들며 사라진다
    lines[1].setAttribute('transform', `translate(10 10) scale(${Math.max(0, 1 - k).toFixed(3)} 1)`);
    lines[1].style.opacity = (1 - k).toFixed(3);
    lines.forEach((l) => { l.style.strokeWidth = (0.83 + 0.5 * k).toFixed(3); });
    // 손잡이는 먼저 빠르게 사라진다
    const kn = clamp01(k * 1.6);
    knobs.forEach((r, i) => {
      r.setAttribute('transform', `translate(${knobAt[i][0]} ${knobAt[i][1]}) scale(1 ${(1 - kn).toFixed(3)})`);
      r.style.opacity = (1 - kn).toFixed(3);
    });
  });
  return { set(open) { X.t = open ? 1 : 0; Springs.kick(); } };
})();

function togglePanel(force) {
  const panel = $('#panel');
  const open = force ?? !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  document.body.classList.toggle('panel-open', open);
  const btn = $('[data-action="panel"]');
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? '부케 설정 닫기' : '부케 설정 열기');
  panelIcon.set(open);
}

// 화면이 넓어지면 모바일 패널·메뉴 상태를 정리한다
matchMedia('(min-width: 860px)').addEventListener('change', (e) => { if (e.matches) togglePanel(false); });
matchMedia('(min-width: 1440px)').addEventListener('change', (e) => { if (e.matches) toggleMenu(false); });

function clearAll() {
  $('#clear-modal').hidden = true;
  lastCleared = { state: structuredClone(state()), applied: structuredClone(ver().applied), refs: [...refs] };
  refs = [];
  renderRefs();
  // 모두 지우기는 3D도 처음처럼 빈 캔버스로 돌린다
  ver().applied = null;
  commit(structuredClone(DEFAULT_STATE));
  toast('모두 지웠어요', {
    label: '되돌리기',
    run: () => { refs = lastCleared.refs; renderRefs(); ver().applied = lastCleared.applied; commit(lastCleared.state); },
  });
}

async function downloadImage() {
  if (!ver().applied) return toast('레퍼런스 사진을 올리면 부케를 저장할 수 있어요');
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

const NOT_FLOWER_MSG = '꽃이 보이지 않는 사진이에요. 꽃다발이나 꽃이 잘 보이는 사진을 올려 주세요.';

// 꽃 사진이 아니면 목록에서 빼고 업로드 칸 아래에 알려 준다. 꽃 사진이면 true
async function keepIfFlower(r, file) {
  r.status = 'analyzing';
  renderRefs();
  const { flower } = await checkFlowerPhoto(file);
  if (flower) return true;
  refs = refs.filter((x) => x !== r);
  URL.revokeObjectURL(r.url);
  renderRefs();
  updateClear();
  const err = $('#ref-error');
  err.textContent = NOT_FLOWER_MSG;
  err.hidden = false;
  return false;
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
    const beforeApplied = ver().applied;
    commit(patch);
    applyChanges(true); // 패널만 채우지 않고 3D에도 바로 보여 준다
    const s = state();
    const names = s.main.map((id) => byId(mainFlowers, id).name).join(' · ');
    toast(`레퍼런스에서 채웠어요: ${byId(shapes, s.shape).label} · ${names}`, {
      label: '되돌리기',
      run: () => { ver().index = before; ver().applied = beforeApplied; render(); },
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
    // 꽃 사진인지 먼저 보고, 한 번에 여러 장을 올리면 첫 꽃 사진으로 채운다
    setTimeout(async () => {
      if (!(await keepIfFlower(r, f))) return;
      if (!first) {
        first = r;
        autofillFromReference(r, f);
      } else {
        r.status = 'done';
        renderRefs();
      }
    }, 700);
  }
  renderRefs();
  updateClear();
});
// 사진 올리기 버튼에 손이 가면 꽃 판별 모델을 미리 받아 둔다
$('#ref-input').closest('section, div')?.addEventListener('pointerenter', warmUpFlowerCheck, { once: true });

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
