// 레퍼런스 사진 분석: 사진 → { shape, main, sub } (shapes.json · flowers.json의 id)
//
// VITE_ANALYZE_URL이 있으면 그 주소(API 키를 가진 서버 함수)에 사진을 보내고,
// 없으면 브라우저 안의 CLIP 모델(아래 꽃 사진 확인과 같은 모델)로 모양과 메인 꽃을 고른다.
import flowersData from './data/flowers.json';

const ENDPOINT = import.meta.env.VITE_ANALYZE_URL;

export async function analyzeReference(file) {
  if (!ENDPOINT) return analyzeInBrowser(file);
  const body = new FormData();
  body.append('image', file);
  const res = await fetch(ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
}

// 모양마다 사진 설명 문장 몇 개. 문장별 확률을 모양별로 더해 가장 큰 모양을 고른다
// (CLIP은 짧고 쉬운 문장을 더 잘 알아본다. 라운드가 가장 흔한 모양이라 문장을 하나 더 둬서 살짝 기본값처럼 쓴다)
const SHAPE_PROMPTS = {
  round: ['a round bouquet', 'a ball-shaped bouquet of flowers', 'a dome-shaped bouquet', 'a round posy'],
  natural: ['a loose natural bouquet', 'a messy wild bouquet', 'an asymmetric hand-tied garden bouquet'],
  cascade: ['a cascade bouquet', 'a waterfall bouquet with flowers trailing down', 'a long hanging teardrop bouquet'],
  crescent: ['a crescent bouquet', 'a crescent moon shaped bouquet', 'a bouquet curving to one side'],
};

// 메인 꽃 → 사진 설명 (판매 중인 꽃만 고른다)
const FLOWER_PROMPTS = {
  'calla-white': 'white calla lilies',
  'daffodil-white': 'white daffodils',
  'rose-dusty-pink': 'dusty pink roses',
  'orchid-dusty-pink': 'dusty pink phalaenopsis orchids',
  'calla-dark-pink': 'dark pink calla lilies',
};

// 사진 가운데(부케가 주로 있는 곳)를 잘라 한 장 더 만든다 → 전체 사진과 함께 봐서 결과가 덜 흔들리게
async function centerCrop(url, keep = 0.7) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const w = img.naturalWidth * keep, h = img.naturalHeight * keep;
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  c.getContext('2d').drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return URL.createObjectURL(blob);
}

/* 실루엣으로 모양 보기: 바탕이 단색에 가까운 사진이면 부케만 떼어 내 '얼마나 꽉 찼는지·가로세로 비율'을 잰다.
   CLIP은 꽃 한 송이 모양(라넌큘러스 = 동그라미)에 끌려 부케 전체 모양을 잘 못 보기 때문.
   잰 값(2026-11-27): 라운드 0.43~0.49 · 내추럴 카라 0.26~0.29 · 크레센트 0.17 (가로≥세로)
   → { shape } 확정, { between: ['round','natural'] } 애매, 바탕이 복잡하면 null */
async function silhouetteShape(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const S = 256, k = S / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); // 투명 배경은 흰 바탕으로
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  // 가장자리 6px 띠의 중간 색 = 바탕색, 그 흩어짐이 크면 바탕이 복잡한 사진
  const border = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 6 || y < 6 || x >= w - 6 || y >= h - 6) border.push(at(x, y));
  const med = (i) => { const v = border.map((p) => p[i]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const dist = (p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
  const spread = border.map(dist).sort((a, b) => a - b)[Math.floor(border.length * 0.9)];
  if (spread > 60) return null;
  const cut = Math.max(28, spread * 2);
  let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (dist(at(x, y)) <= cut) continue;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cover = n / (w * h);
  if (cover < 0.02 || cover > 0.7) return null; // 부케를 못 찾았거나 화면을 꽉 채운 사진
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const fill = n / (bw * bh), tall = bh / bw;
  console.info('silhouette', { fill: +fill.toFixed(3), tall: +tall.toFixed(2), spread: +spread.toFixed(1) });
  if (tall >= 1.5 && fill < 0.4) return { shape: 'cascade' }; // 세로로 길게 늘어진 모양
  if (fill >= 0.4) return { shape: 'round' };
  if (fill < 0.22) return { shape: tall <= 1.15 ? 'crescent' : 'cascade' };
  if (fill < 0.34) return { shape: 'natural' };
  return { between: ['round', 'natural'] };
}

// 라운드가 아닌 모양은 라운드보다 이만큼 높아야 고른다 (CLIP의 모양 구분이 약해서, 애매하면 가장 흔한 라운드로)
const NON_ROUND_MARGIN = 1.25;

async function analyzeInBrowser(file) {
  const classify = await loadClassifier();
  const url = URL.createObjectURL(file);
  let crop;
  try {
    crop = await centerCrop(url).catch(() => null);
    const shapeLabels = Object.entries(SHAPE_PROMPTS).flatMap(([id, ps]) => ps.map((p) => ({ id, p })));
    const shapeScore = {};
    const views = crop ? [url, crop] : [url];
    for (const v of views) {
      const out = await classify(v, shapeLabels.map((l) => l.p), { hypothesis_template: '{}' });
      for (const o of out) {
        const { id } = shapeLabels.find((l) => l.p === o.label);
        shapeScore[id] = (shapeScore[id] || 0) + o.score / views.length;
      }
    }
    // 실루엣이 확실하면 그걸 쓰고, 애매하면 그 후보 안에서만 CLIP 점수로 고른다
    const sil = await silhouetteShape(url).catch(() => null);
    let shape;
    if (sil?.shape) shape = sil.shape;
    else {
      const pool = Object.entries(shapeScore).filter(([id]) => !sil?.between || sil.between.includes(id));
      const [best, bestScore] = pool.sort((a, b) => b[1] - a[1])[0];
      shape = best !== 'round' && bestScore < (shapeScore.round || 0) * NON_ROUND_MARGIN ? 'round' : best;
    }

    const avail = flowersData.mainFlowers.filter((f) => f.available && FLOWER_PROMPTS[f.id]);
    const flowerOut = await classify(url, avail.map((f) => `a bouquet of ${FLOWER_PROMPTS[f.id]}`), { hypothesis_template: '{}' });
    const ranked = flowerOut.map((o) => avail.find((f) => `a bouquet of ${FLOWER_PROMPTS[f.id]}` === o.label));
    const top = flowerOut[0];
    // 1위와 같은 색이면서 점수가 1위의 절반 이상인 꽃까지 함께 고른다
    const main = ranked.filter((f, i) => i === 0 || (f.colour === ranked[0].colour && flowerOut[i].score >= top.score * 0.5));
    console.info('reference analysis', { shape, silhouette: sil, shapeScore, flowers: flowerOut.slice(0, 4) });
    return { shape, main: main.map((f) => f.id), sub: [] };
  } finally {
    URL.revokeObjectURL(url);
    if (crop) URL.revokeObjectURL(crop);
  }
}

/* ───────── 꽃 사진인지 확인 ─────────
   브라우저 안에서 CLIP 이미지 인식 모델로 "꽃·부케 사진"인지 가린다 (서버 없음).
   처음 한 번 모델(약 90MB)을 받고, 그 뒤로는 브라우저 캐시에서 바로 쓴다.
   모델을 못 받거나 실패하면 막지 않고 꽃 사진으로 본다 (업로드를 망가뜨리지 않게). */
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
// 앞쪽 = 꽃, 뒤쪽 = 꽃이 아닌 흔한 사진들
const FLOWER_LABELS = ['a photo of a flower bouquet', 'a photo of flowers', 'a photo of a single flower', 'a photo of a flower arrangement'];
const OTHER_LABELS = [
  'a photo of a person', 'a selfie', 'a photo of food', 'a photo of an animal', 'a photo of a pet',
  'a photo of a building', 'a photo of a room', 'a landscape photo', 'a photo of a car',
  'a screenshot', 'a photo of text or a document', 'a photo of a product', 'a photo of clothes',
  'a photo of a tree or plants without flowers',
];
const FLOWER_MIN = 0.5; // 꽃 쪽 확률 합이 이보다 낮으면 꽃 사진이 아니다

let classifierP = null;
function loadClassifier() {
  if (!classifierP) {
    classifierP = import(/* @vite-ignore */ TRANSFORMERS_URL)
      .then(({ pipeline, env }) => {
        env.allowLocalModels = false;
        return pipeline('zero-shot-image-classification', CLIP_MODEL, { quantized: true });
      })
      .catch((e) => {
        classifierP = null; // 다음에 다시 시도
        throw e;
      });
  }
  return classifierP;
}

// 사진을 올리기 전에 미리 받아 두면 첫 판별이 빨라진다
export function warmUpFlowerCheck() {
  loadClassifier().catch(() => {});
}

// → { flower: true|false, score: 꽃일 확률(0~1) | null }
export async function checkFlowerPhoto(file) {
  let url;
  try {
    const classify = await loadClassifier();
    url = URL.createObjectURL(file);
    const out = await classify(url, [...FLOWER_LABELS, ...OTHER_LABELS]);
    const score = out.filter((o) => FLOWER_LABELS.includes(o.label)).reduce((s, o) => s + o.score, 0);
    return { flower: score >= FLOWER_MIN, score };
  } catch (e) {
    console.warn('flower check skipped', e);
    return { flower: true, score: null };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
