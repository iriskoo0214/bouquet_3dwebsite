# Design System

## 1. System Summary
- 서비스: FLORENCE FLOWER 부케 3D 시안 빌더
- 사용자: 촬영·야외 웨딩을 준비하는 신부 (꽃 이름을 모름)
- 디자인 목표: 부케를 가장 크게 보여주고, 고르는 과정은 조용하고 명확하게

## 2. Design Tokens
실제 값은 `DESIGN_TOKENS.json`을 따른다. **색·글꼴·radius·간격은 토큰으로만 쓴다.**
- Color: bg(canvas · surface · inverse · swatch) / text(strong · primary · secondary · tertiary · disabled · on-inverse) / border(default · strong)
- Typography: Pretendard, letter-spacing -1, 14종 스타일
- Radius: default 4
- Spacing: 4 · 6 · 8 · 12 · 16 · 20 · 24

## 3. Component Rules
COMPONENT_LIBRARY.md 참고

## 4. Layout Rules
| Breakpoint | 레이아웃 |
|---|---|
| ≥1920 (기준) | 헤더 52 / 캔버스 1500 + 우측 패널 420 / 견적 패널은 패널 하단 고정(높이 197) |
| 1024~860 | 캔버스 + 우측 패널 유지, 캔버스 폭 축소 |
| 859~375 (모바일) | 헤더(햄버거 · 로고 · 설정 버튼) → 캔버스 → 견적 패널. 설정 패널은 버튼으로 여는 시트 |
- 패널 좌우 padding 24, 섹션 간 1px 구분선
- 옵션 그리드: 모양 2열, 크기·드레스·조명 3열, 간격 4
- 견적 패널은 스크롤해도 항상 보이게 하단 고정

## 5. State Rules
| 상태 | 표시 | 사용자가 할 수 있는 것 |
|---|---|---|
| Selected | 반전(검정 배경) | 다른 옵션 선택 |
| Collapsed section | 섹션명 + 선택값 요약 + 펼치기 아이콘 | 펼치기 |
| Unavailable | 회색 + "판매 시즌이 아니에요" | 다른 꽃 선택 |
| Disabled | text-disabled 색 | — |
| Loading | 실루엣 shimmer + 2px 진행 막대(bg.inverse) + 퍼센트 | 대기 |
| Error | 흰 메시지 박스(1px 테두리) + 원형 ! 아이콘 + 다시 시도 | 다시 시도 |
| Not ready | 점선 테두리 + text.disabled + "준비 중" 태그 | 다른 옵션 |
| Toast | bg.inverse 배경 + on-inverse 텍스트, 캔버스 하단 중앙, 3초 | 되돌리기(선택) |
| Modal | 45% 검정 dim + 흰 카드 340px, 버튼 2개(Secondary/Primary) | 확인 / 취소 |

> 오류 전용 색(빨강)은 쓰지 않는다. 모노톤 안에서 아이콘과 문구로 알린다.

## 6. Accessibility Rules
- 터치 영역 최소 44px (현재 툴바·옵션 높이 확인 필요)
- 아이콘 버튼(Undo, Redo, 화살표, HAND, 다운로드)에 aria-label
- 옵션 그룹은 radiogroup, 탭은 tablist, 아코디언은 aria-expanded
- 대비 4.5:1 이상 — **#aaa8a6(tertiary) 도움말 문구는 흰 배경 대비 부족**하므로 본문 정보에는 쓰지 않거나 secondary로 올린다
- 키보드로 3D 회전 가능하게 (좌우 화살표)

## 7. Must Follow
- 하드코딩 색상 금지, 토큰만 사용
- 선택 상태는 반드시 반전 스타일 하나로 통일
- 가격은 항상 "(예상)" 또는 "~부터"와 함께 표시
- 옵션을 바꾸면 3D와 견적이 즉시 함께 바뀐다
- 캔버스 위 UI는 최소화(안내 · 버전 · 툴바 · 화살표만)
