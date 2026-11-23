# AI Rules

- 문서에 없는 기능을 임의로 추가하지 않는다. 필요하면 먼저 제안한다.
- 디자인 값은 `05_design/DESIGN_TOKENS.json`에서만 가져온다.
- 수정 전에 관련 MD를 읽고, 문서와 Figma가 충돌하면 사용자에게 묻는다.
- 한 번에 한 단계만 구현하고, 브라우저로 확인한 뒤 다음 단계로 넘어간다.
- 실제 결제·개인정보 수집·AI 합성은 만들지 않고 더미로 흉내 낸다.

## 자주 쓰는 프롬프트
```
06_ai_context/AI_CONTEXT_PACK.md를 읽고, Current Build Goal의 [n]단계를 구현해줘.
Figma: https://www.figma.com/design/BLDX9SypBnmqF0W9QlVxHi/?node-id=240-3028
DESIGN_TOKENS.json 값만 사용하고, 변경한 파일과 이유를 알려줘.
```
```
이 Figma 프레임과 현재 화면을 비교해서 다른 점을 목록으로 알려줘. 고치기 전에 먼저 보여줘.
```
