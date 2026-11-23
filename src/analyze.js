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
