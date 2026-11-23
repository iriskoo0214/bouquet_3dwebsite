# AI Context Pack · FLORENCE FLOWER 부케 3D 시안

## Project Summary
촬영·야외 웨딩을 준비하는 신부가 **꽃 이름을 몰라도** 모양 → 크기 → 색 & 꽃을 골라 3D 부케 시안을 만들고,
드레스·조명과 함께 확인한 뒤, **시안 이미지 한 장을 플로리스트에게 보내 합의**하는 웹 빌더.
MVP = 3D 시안 + 가격 범위 + 확정 기록.

## Documents to Reference
작업 전에 아래 순서로 읽는다.
1. `00_overview/PROJECT_BRIEF.md`: 무엇을, 왜
2. `01_research/USER_INSIGHTS.md`: 누구를 위해, 근거
3. `02_strategy/UX_STRATEGY.md`: 원칙, MVP 범위, 가설
4. `03_structure/STRUCTURE.md`: IA, 옵션, 흐름, 상태
5. `04_content/UX_WRITING.md`: 문구
6. `05_design/DESIGN_SYSTEM.md` + `COMPONENT_LIBRARY.md` + `UI_SPEC.md` + `DESIGN_TOKENS.json`: UI 규칙
7. `07_build_requirements/BUILD_REQUIREMENTS.md` + `MODEL_SPEC.md`: 기술 조건, 3D 모델 사양
8. `06_ai_context/AI_RULES.md`: 작업 규칙

## 진행 상황 (2026-11-18)
- 1~3단계 완료: 레이아웃·토큰, FLOWER 탭(모양 4종 → 3D 교체, 크기·꽃 → 견적), 3D 툴바·Undo/Redo·시안 버전, 상태 화면(로딩·오류·CLEAR·토스트)
- 다음: 4단계(DRESS 탭·ASK TO FLORIST), 5단계(모바일)

## Current Build Goal
현재 코드(부케 3D 뷰어: 회전·확대·시점·AR만 있는 단일 화면)를 **Figma 최종 디자인의 부케 빌더로 확장**한다.
- 1단계: 레이아웃(헤더 · 캔버스 · 우측 패널 · 하단 견적) + 토큰 적용
- 2단계: I. FLOWER 탭 옵션 선택 → 3D·견적 연동
- 3단계: 3D 툴바(Undo/Redo · 앞/뒤/위/아래 · HAND) + 시안 버전
- 4단계: II. DRESS 탭(샘플 드레스 · 조명) + DOWNLOAD IMAGE
- 5단계: 모바일(859~375) 대응

## Required Features
- [x] 3D 모델 드래그 회전 (기존 model-viewer)
- [x] 글로벌 헤더 (FLORENCE FLOWER · HOME · BOUQUET · ABOUT · CONTACT)
- [x] 패널 탭 I. FLOWER / II. DRESS (DRESS는 '준비 중' 화면)
- [x] 레퍼런스 이미지 업로드 (최대 5장, 20MB 제한, 썸네일·삭제)
- [x] 모양 4종(라운드·내추럴·캐스케이드·크레센트) · 크기 3종 · 테마 컬러 · 메인/서브 꽃 선택
- [x] 아코디언 섹션 열고 닫기 + 닫힘 시 선택값 요약
- [x] 예상 견적 실시간 계산 (꽃 단가 × 송이 수, 더미 데이터)
- [x] 판매 시즌이 아닌 꽃 비활성
- [x] 툴바: Undo · Redo · 앞 · 뒤 · 위 · 아래 (HAND는 손 모델 준비 중 → 안내 토스트)
- [x] 시안 버전 전환·복제 (최대 3개, 썸네일 자동 캡처)
- [ ] (4단계) 샘플 드레스(롱·미디·숏) · 조명(자연광·웨딩홀·스튜디오) → 캔버스 배경 변경
- [x] DOWNLOAD IMAGE (시안 + 구성·예상 가격 텍스트 PNG) · CLEAR (확인 모달 + 되돌리기)
- [ ] ASK TO FLORIST (보내기 전 확인·완료 모달) — 4단계
- [ ] 반응형: 1920 · 1024~860 · 859~375

## Must-follow Constraints
- 색·글꼴·radius·간격은 `DESIGN_TOKENS.json` 값만 사용 (CSS 변수로 변환)
- 폰트 Pretendard, letter-spacing -1px
- 선택 상태 = bg.inverse(#16100e) + text.onInverse(#fffef2)
- 가격은 항상 "(예상)" 또는 "~부터"와 함께
- 옵션 변경 시 3D 표현과 견적이 동시에 바뀐다
- UX_WRITING.md 문구 그대로 사용, 오타(FLOLIST 등)는 고쳐서 사용
- 실제 결제·로그인·AI 분석·드레스 합성은 만들지 않는다 (더미로 흉내)

## Build Instructions
- 기술 스택: Vite + Vanilla JS + `@google/model-viewer` (프레임워크 추가 전에 먼저 제안)
- 디자인 기준: https://www.figma.com/design/BLDX9SypBnmqF0W9QlVxHi/?node-id=240-4454 (node 240-3028 데스크톱, 228-5785 모바일)
- 기존 파일 구조 유지: `index.html`, `src/main.js`, `src/style.css`. 데이터는 `src/data/`에 JSON으로 분리
- 꽃·가격 더미 데이터는 `07_build_requirements/BUILD_REQUIREMENTS.md`의 예시를 따른다
- 단계별로 구현하고 각 단계마다 브라우저로 확인한다

## Validation Checklist
- [ ] 1920 화면이 Figma 240-3028과 레이아웃·색·타이포가 일치한다
- [ ] 모양·크기·꽃을 바꾸면 견적이 즉시 바뀐다
- [ ] 꽃 이름을 몰라도 처음 쓰는 사람이 3분 안에 시안을 완성한다 (H1)
- [ ] 다운로드한 이미지에 시안 + 구성(모양·크기·꽃) + 예상 가격이 담긴다 (H3)
- [ ] 375px에서 가로 스크롤이 없고, 견적·ASK TO FLORIST가 항상 보인다
- [ ] 모든 아이콘 버튼에 aria-label, 옵션은 키보드로 선택 가능

## Output Format
- 변경한 파일 목록과 이유
- 브라우저 미리보기 스크린샷 (데스크톱 · 모바일)
- Figma와 다르게 구현한 부분과 그 이유

## Update Rules
- 기능·디자인이 바뀌면 관련 MD를 먼저 고치고 코드를 고친다
- 결정이 바뀐 이유는 `05_design/REFERENCES.md`에 남긴다
- 테스트 결과는 `08_validation/VALIDATION.md`에 쌓는다
