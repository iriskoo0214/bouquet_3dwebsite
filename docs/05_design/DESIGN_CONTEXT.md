# Design Context

> 세부 기준은 같은 폴더의 DESIGN_SYSTEM.md · COMPONENT_LIBRARY.md · UI_SPEC.md · DESIGN_TOKENS.json을 따른다.
> 값의 출처: Figma 구현 페이지 변수(Variables)와 최종 프레임「찐최종+1920」

## Visual Principles
- **부케가 주인공:** 화면의 78%(1500/1920)를 3D 캔버스에 쓰고, 설정은 우측 420px 패널에 모은다
- **에디토리얼 모노톤:** 크림 배경 + 거의 검정(#16100e) + 웜그레이. 컬러는 꽃과 배경 사진에서만 나온다
- **선택은 반전으로:** 선택된 옵션은 검정 배경 + 크림 텍스트
- **얇은 선과 작은 radius(4px):** 카드·버튼은 1px 테두리, 그림자 없음
- 캔버스 배경은 빛이 드는 크림·베이지 공간(자연광 사진)으로 조명 옵션에 따라 바뀐다

## Color
| Token | Value | 용도 |
|---|---|---|
| color.bg.canvas | #fffef2 | 페이지·헤더 배경, 반전 텍스트 |
| color.bg.surface | #ffffff | 패널, 버튼 배경 |
| color.bg.inverse | #16100e | Primary 버튼, 선택된 옵션, 활성 탭 |
| color.bg.swatch | #e2ded5 | 컬러칩·썸네일 자리 |
| color.text.strong | #16100e | 제목, 금액 |
| color.text.primary | #3e322c | 본문, 옵션 |
| color.text.secondary | #8a7f78 | 섹션 라벨 보조, 안내 |
| color.text.tertiary | #aaa8a6 | 도움말 문구 |
| color.text.disabled | #ccc5bb | 비활성 버튼(CLEAR, Redo) |
| color.text.on-inverse | #fffef2 | 반전 배경 위 텍스트 |
| color.border.default | #ccc5bb | 버튼·옵션 테두리, 구분선 |
| color.border.strong | #16100e | 강조 테두리, 헤더 하단선 |

## Typography (Pretendard, letter-spacing -1)
| Style | Size / Weight / Line-height | 용도 |
|---|---|---|
| Display/Price | 24 / SemiBold / 1.5 | 예상 금액 |
| Body/Description | 16 / Regular / 1.3 | 설명 |
| Button/Large | 16 / SemiBold / 1.5 | ASK TO FLORIST |
| Brand/Logo | 15 / SemiBold / 1.5 | 로고 |
| Heading/Section | 14 / Medium / 1.3 | 섹션 제목 (SHAPE OF BOUQUET) |
| Tab/View | 14 / Medium / 1.5 | 툴바 시점 탭 |
| Nav/Menu | 13 / Regular / 1.5 | 글로벌 메뉴 |
| Tab/Panel | 13 / Medium / 1.5 | I. FLOWER / II. DRESS |
| Button/Medium | 13 / Regular / 1.5 | DOWNLOAD IMAGE 등 |
| Option/Title | 13 / SemiBold / 1.3 | 옵션명 (스몰) |
| Label/Sub | 13 / Light / 1.3 | 보조 라벨, 도움말 |
| Button/Small | 12 / SemiBold / 1.3 | UPLOAD IMAGE |
| Option/Sub | 11 / Regular / 1.3 | 옵션 보조 (10~15송이) |
| Caption/Regular·Medium·Bold | 11 / 400·500·700 / 1.5 | VERSION, 시안 라벨 |

## Component Rules
COMPONENT_LIBRARY.md 참고. 핵심: 옵션 버튼(텍스트형·2줄형), 아코디언 섹션, 패널 탭, 3D 툴바, Primary/Secondary/Text 버튼, 썸네일 업로드 슬롯.

## UX Writing Tone
04_content/UX_WRITING.md 참고 — 해요체, 섹션 제목은 영문 대문자

## Interaction States
| 상태 | 표현 |
|---|---|
| Default | 흰 배경 + 1px #ccc5bb 테두리 |
| Selected | #16100e 배경 + #fffef2 텍스트 |
| Disabled / Unavailable | 텍스트 #ccc5bb, "판매 시즌이 아니에요" |
| Hover | 테두리 border.strong(#16100e) |
| Focus | 2px 흰 간격 + 2px #16100e 링 (키보드 조작 시) |

## Figma Reference
- 기획 장표 + 최종 화면: https://www.figma.com/design/BLDX9SypBnmqF0W9QlVxHi/?node-id=240-4454
- 데스크톱 최종(패널 열림): node 240-3028 · 패널 닫힘: 240-3096
- 조명별 배경 (2026-11-19 갱신): 배경1 250:3981 = 자연광 · 배경2 250:4230 = 실내광 · 배경3 250:4481 = 어두운 조명 → `public/assets/figma/canvas-bg-{natural,indoor,dim}.jpg`
- 아이콘 세트: 240-4389
- 반응형(Page 2): 1920 221-3462 · 1024 221-4215 · 860 221-5267 · 모바일 375 228-5785 · 360 패널 234-958


## 구현 기준 (2026-11-18, Figma `get_design_context`로 확인)
- 아이콘·배경은 Figma에서 받은 파일만 쓴다: `public/assets/figma/` (undo · redo · eye · 화살표 · 섹션 − / + · 체크 · 다운로드 · 작은 + · 꽃 썸네일 · 캔버스 배경)
- 패널 배경은 bg.canvas(#fffef2), 견적 영역만 bg.surface(흰색)
- 섹션 제목은 text.primary(#3e322c), 도움말은 16px Regular text.tertiary(#aaa8a6)
- 색 선택은 둥근 점이 아니라 **네모 스와치**: 기본 20px, 선택 24px + 검정 테두리
- 꽃 행: 34px 썸네일 + 이름 13 SemiBold / 가격 11 Regular, 체크박스 28px(선택 시 검정 + 체크), 판매 시즌 아님은 행 전체 opacity 40%
- 섹션 접기(closed, 240:3160): 높이 60, 제목 + 고른 값 요약(색은 24px 칩 2개) + `+` 아이콘. 꽃 섹션 제목은 펼침 "BOUQUET COLOUR", 접힘 "COLOUR & FLOWERS"
- 툴바(240:3047): 흰색 60% 배경, 그룹 사이 2×28px 구분선, 비활성 아이콘 opacity 35%
- LIGHTING은 Figma대로 FLOWER 탭 맨 아래 (자연광 · 실내광 · 어두운 조명)


## 반응형 (2026-11-19, Figma 구현 페이지 1024 · 860 · 모바일 375 프레임 기준)
| 구간 | Figma | 헤더 | 본문 | 툴바 · 화살표 · 시안 | 견적 |
|---|---|---|---|---|---|
| 1440px 이상 | 1920 (240:3028) | 로고 + 메뉴 4개, 좌우 52 | 캔버스 + 패널 420 | 툴바 bottom 108, 화살표 64px | 안내 문구 · 금액 한 줄 |
| 860~1439px | 1024 (244:1657) · 860 (244:2013) | ☰(24px) + 로고, 좌우 24, 메뉴는 ☰로 펼침 | 캔버스 + 패널 360 | 툴바 bottom 38, 화살표 좌우 32px | 안내 문구 위 / 금액 아래 오른쪽 정렬, 버튼 글자 12px |
| 859px 이하 | 모바일 375 (244:2369 · 244:2430 · 244:2684) | ☰ + 로고 + 오른쪽 패널 버튼(30px 원) | 캔버스 547px → 견적(213px, 안내 문구와 금액 간격 2px) → (패널은 버튼으로 열리는 전체 화면 시트) | 툴바 bottom 40·작은 여백, 화살표 32px, 시안 썸네일 30px, 회전 안내 숨김 | padding 24 |
- 모바일 패널 맨 아래: 고른 값 칩 줄(244:2661) — 칩을 누르면 해당 섹션으로 이동, ⊗를 누르면 그 값을 지움(꽃은 1종 이상 유지)
- 374px 이하(Figma 범위 밖)는 툴바·버튼 여백을 더 줄여 넘치지 않게만 처리

## Figma 수정 반영 (2026-11-19 오후)
- 옵션 보조 글자(Option/Sub: 송이 수, 꽃 가격·판매 시즌 안내) 11px → 12px
- 조명 섹션 아래 구분선 삭제
- 조명별 캔버스 배경 사진 3장 추가 (배경1·2·3)
- 모바일: 캔버스 535 → 547px, 견적 225 → 213px (안내 문구–금액 간격 14 → 2px)
