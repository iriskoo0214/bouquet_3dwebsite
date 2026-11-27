# Component Library

## Global Header
- 높이 52, 배경 bg.canvas, 하단 1px 선
- 좌: 로고 FLORENCE FLOWER (Brand/Logo) / 우: HOME · BOUQUET · ABOUT · CONTACT (Nav/Menu, 간격 40, 현재 페이지는 text.strong)
- 모바일: 햄버거 · 로고 · 원형 설정(필터) 버튼

## Panel Tab
- 2분할(각 210), 높이 54
- Active: bg.inverse + on-inverse 텍스트 + 밑줄 / Inactive: 흰 배경 + secondary 텍스트
- 라벨: I. FLOWER / II. DRESS

## Accordion Section
- Anatomy: 섹션 제목(Heading/Section) + [닫힘일 때 선택값 요약] + 우측 아이콘(열림 −, 닫힘 펼치기)
- 닫힘 높이 60, 섹션 사이 1px border.default
- Do: 닫혀도 현재 선택값이 보이게 / Don't: 요약 없이 제목만 두기

## Option Button
- **텍스트형** (모양·조명): 1줄, 높이 ~30, 2~3열 그리드
- **2줄형** (크기·샘플 드레스): Option/Title + Option/Sub (예: 스몰 / 10~15송이)
- **이미지형** (샘플 드레스): 썸네일 + 2줄 텍스트
- State: Default(흰 배경 · 1px border.default) / Selected(bg.inverse · on-inverse) / Disabled
- radius 4

## Flower Card (COLOUR & FLOWERS)
- 꽃 사진 + 이름 + "1송이 6,500원부터~"
- State: Default / Selected / Unavailable("판매 시즌이 아니에요")
- 테마 컬러 선택 시 그 색 계열 꽃만 표시, "+ 계열 n종 더 보기"

## Color Chip
- 24×24 원형/사각 칩, 선택 시 테두리 강조. 닫힘 요약에도 사용

## Upload Slot
- UPLOAD IMAGE 버튼(가로 전체, 1px 테두리, Button/Small)
- 썸네일 60×77, 간격 4, 마지막 칸은 점선 + "+" (빈 칸)

## 3D Toolbar (캔버스 하단 중앙)
- 반투명 흰 배경 + 1px 테두리, radius 4
- 그룹: [Undo · Redo] | [앞 · 뒤 · 위 · 아래] | [HAND 👁]
- 구분선으로 그룹 분리, 비활성 아이콘은 disabled 색

## Version Thumbnails (캔버스 좌하단)
- 라벨 VERSION(Caption), 썸네일 + "시안 1 / 시안 2", 선택 시 테두리 + Bold

## Canvas Arrows
- 좌우 화살표, 다음 시안이 없으면 흐리게

## Estimate Panel (하단 고정)
- 안내 "꽃 시세에 따라 조금 달라질 수 있어요"(Label/Sub) + "(예상)" + 금액(Display/Price)
- Primary: ASK TO FLORIST (372×44, bg.inverse, Button/Large)
- Secondary: DOWNLOAD IMAGE (184×42, 테두리 + 다운로드 아이콘)
- Text: CLEAR (184×40, disabled 색 → 변경 사항이 있을 때 활성)

## Icons
plus · minus · download · chevron-down/left/right · heart · share · check · sort · star · lock · info · eye · eye-slash · menu · filter · close · circle-close (24px)

## State View · Toast · Modal
시안: `05_design/states-preview.html`
- **Loader:** 부케 실루엣(90×150, shimmer) + 2px 진행 막대 + Label/Sub 문구
- **Message box:** 300px, 흰 배경, 1px border.default, 아이콘 24 + 제목 16 SemiBold + 도움말 + Secondary 버튼
- **Toast:** bg.inverse, 13px, radius 4, 캔버스 하단 24px, 3초 / 링크형 "되돌리기"
- **Modal:** 340px, padding 24, 제목 16 SemiBold, 버튼 2열(왼쪽 Secondary · 오른쪽 Primary)
- **Empty:** 1px 점선 박스 + 제목 + 도움말 + 작은 Secondary 버튼
- **Thumbnail 상태:** 올리는 중(55% 검정 덮개 + 진행 막대) / 실패(크림 덮개 + 1px 검정 테두리 + "다시 올리기")
- **Option 준비 중:** 점선 + text.disabled + 우상단 "준비 중" 태그
