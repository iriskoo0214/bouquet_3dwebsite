// 레퍼런스 사진 분석: 사진 → { shape, main, sub } (shapes.json · flowers.json의 id)
//
// VITE_ANALYZE_URL이 있으면 그 주소(API 키를 가진 서버 함수)에 사진을 보내고,
// 없으면 아직 AI가 연결되지 않은 프로토타입이라 정해진 결과를 돌려준다.
const ENDPOINT = import.meta.env.VITE_ANALYZE_URL;

// 프로토타입용 고정 결과 (크레센트 레퍼런스 예시)
const MOCK = { shape: 'crescent', main: ['phalaenopsis-white', 'calla-white'], sub: [] };

export async function analyzeReference(file) {
  if (!ENDPOINT) {
    await new Promise((r) => setTimeout(r, 1400));
    return MOCK;
  }
  const body = new FormData();
  body.append('image', file);
  const res = await fetch(ENDPOINT, { method: 'POST', body });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
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
