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
  juliet: 'pink garden roses',
  'ranunculus-pink': 'pink ranunculus flowers',
  'tulip-pink': 'pink tulips',
  'peony-pink': 'pink peonies',
  'lily-white': 'white lilies',
  'phalaenopsis-white': 'white phalaenopsis orchids',
  'calla-white': 'white calla lilies',
  'tulip-white': 'white tulips',
  'rose-peach': 'peach roses',
  'ranunculus-peach': 'peach ranunculus flowers',
  'calla-coral': 'coral red calla lilies',
  'tulip-red': 'red tulips',
};

async function analyzeInBrowser(file) {
  const classify = await loadClassifier();
  const url = URL.createObjectURL(file);
  try {
    const shapeLabels = Object.entries(SHAPE_PROMPTS).flatMap(([id, ps]) => ps.map((p) => ({ id, p })));
    const shapeOut = await classify(url, shapeLabels.map((l) => l.p), { hypothesis_template: '{}' });
    const shapeScore = {};
    for (const o of shapeOut) {
      const { id } = shapeLabels.find((l) => l.p === o.label);
      shapeScore[id] = (shapeScore[id] || 0) + o.score;
    }
    const shape = Object.entries(shapeScore).sort((a, b) => b[1] - a[1])[0][0];

    const avail = flowersData.mainFlowers.filter((f) => f.available && FLOWER_PROMPTS[f.id]);
    const flowerOut = await classify(url, avail.map((f) => `a bouquet of ${FLOWER_PROMPTS[f.id]}`), { hypothesis_template: '{}' });
    const ranked = flowerOut.map((o) => avail.find((f) => `a bouquet of ${FLOWER_PROMPTS[f.id]}` === o.label));
    const top = flowerOut[0];
    // 1위와 같은 색이면서 점수가 1위의 절반 이상인 꽃까지 함께 고른다
    const main = ranked.filter((f, i) => i === 0 || (f.colour === ranked[0].colour && flowerOut[i].score >= top.score * 0.5));
    console.info('reference analysis', { shapeScore, flowers: flowerOut.slice(0, 4) });
    return { shape, main: main.map((f) => f.id), sub: [] };
  } finally {
    URL.revokeObjectURL(url);
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
