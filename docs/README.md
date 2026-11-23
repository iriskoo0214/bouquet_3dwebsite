# FLORENCE FLOWER 부케 3D 시안 · 프로젝트 문서

AI가 **문제 → 사용자 → 전략 → 구조 → 문구 → 디자인 → 구현 → 검증** 순서로 읽도록 정리한 폴더예요.
바이브 코딩을 시작할 때는 `06_ai_context/AI_CONTEXT_PACK.md`를 AI에게 먼저 주세요.

| 폴더 | 역할 | 대표 문서 |
|---|---|---|
| 00_overview | 프로젝트 전체를 빠르게 이해하는 시작점 | PROJECT_BRIEF.md |
| 01_research | 사용자와 문제의 근거 | USER_INSIGHTS.md |
| 02_strategy | 무엇을 왜 어디까지 만들지 | UX_STRATEGY.md |
| 03_structure | IA · User Flow · 화면 목록 · 상태 정의 | STRUCTURE.md |
| 04_content | UX Writing · CTA · Error/Empty/Guide 문구 | UX_WRITING.md |
| 05_design | 디자인 방향 · 규칙 · 컴포넌트 · 수치 · 토큰 · 근거 | DESIGN_CONTEXT.md 외 |
| 06_ai_context | AI가 일하는 방식과 공통 규칙 | AI_CONTEXT_PACK.md, AI_RULES.md |
| 07_build_requirements | 기능 · 데이터 · 기술 스택 · 인터랙션 | BUILD_REQUIREMENTS.md |
| 08_validation | 검증 기준과 개선 목록 | VALIDATION.md |

## 작성 순서
1. `05_design/` 정리 (디자인 완료 상태이므로 먼저)
2. `PROJECT_BRIEF` → `USER_INSIGHTS` → `UX_STRATEGY` → `DESIGN_CONTEXT`
3. `AI_CONTEXT_PACK`으로 연결한 뒤 구현 시작

## 작성 규칙
- `<!-- TODO -->` 표시가 있는 곳을 채워요. 내용은 Figma「부케 시안 서비스 기획 장표」에서 가져왔어요. 남은 TODO는 Figma에 근거가 없는 항목이에요.
- 이미지(저니맵·플로우)는 **표**로 바꿔요.
- "쉽게, 예쁘게" 대신 **측정 가능한 기준문**으로 써요. (예: "원하는 각도까지 2번 이내 조작")
- 제목 계층(# / ## / ###)을 일관되게, 긴 문단 대신 짧은 bullet로 써요.
