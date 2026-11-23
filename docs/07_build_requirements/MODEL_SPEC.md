# Model Spec · 모양별 부케 3D 모델

> 결정: 모양 4종(라운드·내추럴·캐스케이드·크레센트)마다 .glb 모델을 따로 준비한다 (2026-11-18 확정, 이전 6종에서 변경)

## 준비할 모델
| id | 모양 | 설명 (STRUCTURE.md 기준) | 파일 | 상태 |
|---|---|---|---|---|
| round | 라운드 | 둥글고 빽빽하게 모은 기본형 | `round.glb` | ✓ Tripo (2026-11-18) |
| natural | 내추럴 | 줄기가 보이게 느슨하고 자연스럽게 | `natural.glb` | ✓ 원본에서 손 제거 (2026-11-18) |
| cascade | 캐스케이드 | 위는 풍성하고, 아래로 폭포처럼 흘러내리는 | `cascade.glb` | ✓ Tripo (2026-11-18) |
| crescent | 크레센트 | 초승달처럼 한쪽 또는 양쪽으로 휘어지는 | `crescent.glb` | ✓ Tripo (2026-11-18) |

저장 위치: `public/models/shapes/<id>.glb`

## 공통 사양
| 항목 | 기준 | 이유 |
|---|---|---|
| 형식 | .glb (glTF 2.0 binary) | model-viewer 기본 형식 |
| 용량 | 모델당 **5MB 이하** (가능하면 3MB) | 6개를 바꿔 가며 불러와야 함. 현재 model.glb는 10MB |
| 폴리곤 | 10만 tri 이하 | 모바일 성능 |
| 텍스처 | 2048px 이하, 가능하면 KTX2/WebP 압축 | 용량 |
| 단위·크기 | 미디엄 기준 높이 약 1.9 (현재 모델: 높이 1.89, 폭 1.38) | 모양을 바꿔도 화면에서 크기가 튀지 않게 |
| 기준점(origin) | 부케 손잡이(묶음 부분) 중앙 | HAND 모드에서 손 위치 맞추기 |
| 방향 | +Y 위, 정면이 +Z | 앞·뒤·위·아래 시점 버튼이 같은 각도로 동작 |
| 배경·바닥 | 포함하지 않음 | 조명·드레스 배경은 화면에서 따로 바꿈 |

## 색 변경을 위한 material 규칙
현재 model.glb는 **mesh 1개 · material 1개(이름 없음)** 라서 꽃별 색 변경이 안 된다.
색 & 꽃 옵션을 3D에 반영하려면 꽃 종류별로 material을 나눠야 한다.

| material 이름 | 대상 | 화면에서 바꾸는 값 |
|---|---|---|
| `flower_main` | 메인 꽃 | MAIN COLOUR |
| `flower_sub` | 서브 꽃 | SUB COLOUR |
| `filler` | 안개꽃·채움 꽃 | — |
| `green` | 잎·유칼립투스 | — |
| `stem` | 줄기 | — |
| `ribbon` | 리본·마감 | — |

- material을 나누기 어렵다면(AI 생성·스캔 모델): 색은 **테마 컬러별 텍스처 버전**을 따로 만들거나, 프로토타입에서는 색 변경을 3D에 반영하지 않고 패널·견적에만 반영한다 <!-- TODO: 택1 -->

## 모델 구하는 방법 (택1 또는 섞어서)
| 방법 | 장점 | 단점 |
|---|---|---|
| 이미지 → 3D AI 생성 (모양별 부케 사진 1장씩) | 빠름, 기존 model.glb와 같은 방식일 가능성 | material 분리 안 됨, 형태가 뭉개질 수 있음, 유료 크레딧 |
| 3D 에셋 마켓 (Sketchfab, CGTrader 등) | 품질 좋음 | 6종 스타일을 맞추기 어려움, 라이선스 확인 필요 |
| Blender로 직접 제작 (꽃 에셋 배치) | material 분리·스타일 통일 가능 | 시간이 가장 오래 걸림 |

## AI 생성 계획 (2026-11-18 조사)
1. **입력 이미지 6장 만들기:** 모양마다 부케 1개, 정면, 흰 배경, 같은 꽃 구성(피치·핑크 톤)과 같은 조명. 손이나 사람은 넣지 않음 (gpt_image_2_6, 장당 0.25크레딧)
2. **이미지 → 3D 변환:** 먼저 한 모양(라운드)으로 두 모델을 비교해 보고, 나은 쪽으로 나머지 5개를 만든다
3. **후처리:** 용량을 5MB 이하로 줄이고, 크기·방향·기준점 맞추기 (gltf-transform 등)

| 모델 | 1개당 비용 | 6개 | 특징 |
|---|---|---|---|
| Tripo H3.1 Image to 3D | 9크레딧 | 54 | 텍스처·PBR 기본 포함, 가장 저렴 |
| Hunyuan3D v3 | 11크레딧 | 66 | 고밀도 메시 (기본 50만 면, 용량 줄이기 필요) |
| Meshy 7 (텍스처 포함) | 38크레딧 | 228 | 품질 기대치 높음, 잔액 초과 |

- 2026-11-18 기준 잔액: 106.75크레딧 (starter)
- 예상 총비용 (Tripo 기준): 이미지 1.5 + 3D 54 = **약 56크레딧**
- 한계: 결과가 한 덩어리 메시라 꽃별 색 변경은 어렵다. 꽃잎이 얇거나 캐스케이드처럼 늘어지는 형태는 뭉개질 수 있다

## 실험 결과 1 · Higgsfield (2026-11-16)
파일: `hf_20261116_072815_….glb` = 현재 `public/models/model.glb`와 같은 파일

| 항목 | 결과 | 기준 | 판정 |
|---|---|---|---|
| 용량 | 10.0MB (텍스처 JPEG 3.9MB) | 5MB 이하 | ✕ 줄여야 함 |
| 폴리곤 | 11.4만 tri | 10만 이하 | △ 살짝 초과 |
| 크기 | 높이 1.89 · 폭 1.38 | 높이 약 1.9 | ○ |
| 방향 | +Y 위, 정면 +Z | 같음 | ○ |
| material | 1개(이름 없음), 텍스처 1장 | 꽃별 분리 | ✕ 색 변경 불가 |
| 손·팔 | **모델에 붙어 있음** | 부케만 | ✕ HAND 토글 불가 |
| 정면 품질 | 튤립·거베라·스위트피·안개꽃이 Figma 시안과 비슷 | — | ○ |
| 뒷면 품질 | 안개꽃 위주로 뭉개지고 튤립이 덩어리처럼 보임 | — | △ |
| 잡티 | 리본 근처에 떠 있는 조각 | 없음 | △ |
| 모양 | 줄기가 보이고 느슨한 형태 → 라운드보다 **내추럴**에 가까움 | — | — |

다음 생성 때 바꿀 점
- 입력 이미지에서 **손과 팔을 빼고 부케만** 넣는다 (HAND 모드는 손 모델을 따로 겹친다)
- 뒷면 품질을 위해 **multiview(정면·측면·뒷면) 이미지**로 생성하는 것을 검토한다
- 생성 후 텍스처를 1024~2048px로 줄이고 메시를 압축해 5MB 이하로 맞춘다
- 이번 결과는 `natural.glb` 후보로 쓴다

## 실험 결과 2 · 손 없는 버전 (2026-11-18)
과정: 기존 model.glb를 브라우저에서 렌더 → Higgsfield GPT Image 2.6으로 손·팔·잡티 제거(0.5크레딧) → Tripo H3.1 Image to 3D(9크레딧)
- 입력 이미지: `model_sources/natural_front_nohand.png`
- 결과: `public/models/shapes/natural.glb`

| 항목 | 결과 | 판정 |
|---|---|---|
| 손·팔 | 없음, 리본 묶음 + 줄기로 끝남 | ○ HAND 토글 가능 |
| 용량 | 3.5MB (텍스처 1.1MB) | ○ |
| 폴리곤 | 7.5만 tri | ○ |
| 높이 | 1.0 (기준 1.9) | △ 화면에서 1.9배로 맞춤 (`heightScale`) |
| 방향 | 정면이 -X를 봄 | △ `orientation: 0deg 0deg 90deg`로 보정 |
| material | 1개 | ✕ 색 변경 불가 (기존과 같음) |
| 품질 | 튤립·스위트피·리본은 깔끔. 거베라는 납작한 크림색 원반처럼 뭉개짐, 안개꽃 양이 줄어 원본보다 성긴 느낌 | △ |
| 뒷면 | 원본보다 깨끗하고 잡티 없음 | ○ |

> **폐기:** AI가 모델을 새로 만들면서 거베라·안개꽃 등 원본 꽃 구성이 달라져서 쓰지 않는다. (파일은 프로젝트에서 뺐다)

## 실험 결과 3 · 원본에서 손만 잘라내기 (2026-11-18) ✓ 채택
과정: 원본 model.glb에서 손·팔·떠 있는 조각만 지우고, 손이 가리던 자리의 줄기를 초록 원기둥 14개로 채움 → 법선·UV 압축(KHR_mesh_quantization), 텍스처 JPEG 재압축
- 스크립트: `tools/cut_hand.py`(손 제거) → `tools/finish_model.py`(줄기 채우기·압축)
- 결과: `public/models/shapes/natural.glb` · 크레딧 사용 0

| 항목 | 결과 | 판정 |
|---|---|---|
| 꽃 구성·텍스처 | **원본과 동일** (튤립·거베라·스위트피·안개꽃·리본) | ○ |
| 손·팔 | 없음 | ○ HAND 토글 가능 |
| 줄기 | 리본 아래로 채운 줄기, 가까이 보면 원본 줄기와 질감이 약간 다름 | △ |
| 용량 | 4.9MB (텍스처 0.74MB) | ○ |
| 폴리곤 | 10.8만 tri | △ 살짝 초과, 성능 문제 없으면 유지 |
| 크기 | 높이 1.75 | ○ |
| 방향 | 정면이 기본 카메라(0°)를 봄 | ○ |
| material | 1개 | ✕ 색 변경 불가 (원본과 같음) |

> 나머지 모양도 같은 방식이 가능하려면 **손 없이 생성된 원본**이 필요하다. 새로 생성할 때는 입력 이미지에 손을 넣지 않는다.

## 3D 수정 v2 (2026-11-18)
사용자 요청으로 입력 이미지를 고친 뒤 같은 설정(Tripo H3.1, face_limit 80,000, 텍스처 켬, PBR 끔)으로 다시 만들었다. v1 모델은 `model_sources/previous_glb/*_v1.glb`에 보관.

| 모양 | 요청 | 입력 이미지 수정 (Seedream 4.5) | 결과 | 방향 |
|---|---|---|---|---|
| 라운드 | 가운데 흰 손잡이(새틴 리본) 없애기 | `round_input_v2.png` — 흰 손잡이 → 초록 줄기 | 정면은 깔끔. **뒷면에서 줄기가 꽃 위로 기둥처럼 올라가 보임** | `0deg 0deg 90deg` |
| 크레센트 | 중간에 끊긴 줄기 잇기 | 1차는 확대돼 양끝이 잘리고 위에 줄이 생김, 2차는 액자처럼 들어가 실패 → 원본에 여백을 붙여 다시 → `crescent_input_v2.png` | 줄기가 모두 이어짐, 곡선 유지. 위쪽에 고리 모양 그라스 1개 | `0deg 0deg 90deg` |
| 캐스케이드 | 뒤쪽 둥근 꽃을 수국처럼, 늘어진 꽃을 더 꽃처럼 | 1차는 카라·아마란서스가 유리처럼 변해 폐기 → 2차 `cascade_input_v2.png` | 정면: 수국 송이·카라·아마란서스 또렷. **뒷면은 초록 덩어리로 뭉개짐** | `0deg 0deg 90deg` |

- 실패한 이미지는 `model_sources/rejected/`
- v2는 Tripo 정면이 -X 방향이라 v1과 보정 방향이 반대다

## 4종 3D 완성 v1 (2026-11-18)
라운드·캐스케이드·크레센트를 Tripo H3.1 Image to 3D(face_limit 80,000, 텍스처 켬, PBR 끔)로 변환했다 (3개 27크레딧).

| 모양 | 용량 | 폴리곤 | 방향 보정 | 확인 결과 |
|---|---|---|---|---|
| 라운드 | 3.1MB | 7.7만 | `0deg 0deg -90deg` | 호접란 볼·새틴 리본·진주 핀까지 잘 나옴 |
| 내추럴 | 4.9MB | 10.8만 | 없음 | 원본에서 손만 제거 |
| 캐스케이드 | 3.6MB | 7.6만 | `0deg 0deg -90deg` | 카라·아마란서스 늘어짐 유지, 가는 가지는 단순해짐 |
| 크레센트 | 3.3MB | 7.8만 | `0deg 0deg -90deg` | 초승달 곡선·카라·호접란 잘 나옴, 뒷면은 색이 조금 진함 |

- Tripo 모델은 정면이 +X를 본다 → 화면에서 -90° 돌려 맞춘다 (shapes.json `orientation`)
- Tripo 모델 높이는 1.0, 내추럴은 1.75. model-viewer가 모델마다 화면에 맞춰 보여주므로 지금은 문제없지만, 크기 비교(드레스 합성 등)를 할 때는 높이를 맞춰야 한다

## 모양별 레퍼런스 · 입력 이미지 (2026-11-18)

> **4종 확정 후 정리:** 돔·포지·프레젠테이션(페지먼트)은 빠졌다. 해당 입력 이미지와 레퍼런스는 `model_sources/unused/`로 옮겼다.
> 사용자가 모양별 레퍼런스 모음을 추가로 줬다: `model_sources/refs/round_refs.png` · `cascade_refs.png` · `crescent_refs.png`
>
> | 모양 | 입력 이미지 | 레퍼런스 모음 |
> |---|---|---|
> | 라운드 | `round_input.png` (호접란 볼) | `refs/round_refs.png` (피치·화이트 장미, 작약) |
> | 내추럴 | 완료 (`natural.glb`) | — |
> | 캐스케이드 | `cascade_input.png` (카라·아마란서스) | `refs/cascade_refs.png` |
> | 크레센트 | `crescent_input.png` (코랄 카라·핑크 호접란·스틸그라스, Seedream 4.5로 손·문구 제거 1크레딧) | `refs/crescent_ref_main.jpg` (기준), `refs/crescent_refs.png` · 비교: `crescent_compare.png` |

### 이전 기록 (6종 기준)
사용자가 준 플로리스트 레퍼런스 5장을 모양별로 배정하고, Higgsfield GPT Image 2.6으로 사람·손·배경·글자를 지운 입력 이미지를 만들었다 (5장 2.5크레딧).
한눈에 보기: `model_sources/inputs_sheet.png`

| 모양 | 레퍼런스 | 꽃 구성 | 입력 이미지 | 3D |
|---|---|---|---|---|
| cascade | ① 카라 + 아마란서스 | 카라·흰 스프레이 꽃·아마란서스·그린 | `cascade_input.png` (Seedream 4.5로 위쪽 줄기 제거, 원본은 `_v1`) | ☐ |
| round | ② 호접란 볼 (리본·진주핀) | 흰 호접란 | `round_input.png` | ☐ |
| dome | ③ 호접란 + 초코 코스모스 | 호접란·초코 코스모스·그래스 | `dome_input.png` | ☐ (돔 형태가 약함) |
| presentation | ④ 호접란 캐스케이드 | 호접란·덩굴·작은 필러 | `presentation_input.png` (비스듬히 눕힌 모습) | ☐ |
| posy | ⑤ 흰 튤립 | 크림 튤립·흰 별꽃·그린 | `posy_input.png` | ☐ |

> 내추럴(핑크 튤립·거베라)과 나머지 5개(화이트 계열)는 꽃 구성이 다르다. 모양 선택이 꽃까지 바꾸는 셈이므로, 화면에서는 "모양별 예시 부케"로 안내한다.

## 재생성 가이드 (손 없이)
### 1) 입력 이미지 프롬프트 (모양만 바꿔서 6번)
```
A single wedding bouquet, [SHAPE], pastel pink tulips, cream gerberas, lavender sweet peas,
baby's breath, sheer blush ribbon tied around the stems.
Standing upright, stems visible at the bottom, NO hands, NO arm, NO person, NO vase.
Front view, centered, full bouquet in frame with margin, pure white background,
soft even studio lighting, no shadows, photorealistic product photo.
```
| id | [SHAPE] |
|---|---|
| round | round, dense and compact dome of flowers |
| dome | tall dome shape, flowers rising high in the center |
| natural | loose natural hand-tied, stems visible, airy |
| cascade | cascading teardrop shape, flowers and greenery trailing downward |
| presentation | long-stemmed presentation bouquet, laid diagonally like held in the arm |
| posy | small tight posy, fits in one hand |

- 같은 꽃 구성·조명·배경을 유지해야 6개가 같은 부케처럼 보인다
- 멀티뷰로 만들 경우 같은 프롬프트에 `side view` · `back view`를 붙여 2~4장 생성

### 2) 3D 변환 설정 (Higgsfield)
| 항목 | 값 |
|---|---|
| 모델 | Tripo H3.1 Multiview(뷰 여러 장) 또는 Image to 3D(1장) |
| face_limit | 80,000 이하 |
| texture | 켬, texture_quality standard |
| PBR | 끔 (용량 절약) |

### 3) 받은 뒤
- 파일 이름을 `<id>.glb`로 바꿔 `public/models/shapes/`에 넣는다
- 용량 줄이기·방향 맞추기는 AI에게 요청한다

## 꽃별 모델 (variants) · 2026-11-19
모양 + 첫 번째 메인 꽃 조합마다 전용 모델을 붙일 수 있다. 전용 모델이 없으면 모양 기본 모델을 보여 준다.

- 파일: `public/models/shapes/<모양 id>__<꽃 id>.glb` (꽃 id는 `flowers.json`의 mainFlowers id)
- 등록: `shapes.json`의 해당 모양에 `"variants": { "<꽃 id>": "/models/shapes/<파일>" }` 한 줄 추가
- 만드는 흐름 (Figma Weave): 원본 이미지(모양) + `flower types`(꽃 이름) → Seedream A 꽃 교체 → Seedream B 리본(`ribbon finish-<모양>`) → Tripo H3.1(Face Limit 100000, PBR·Texture 켬) → GLB 다운로드
- 받은 뒤: 노멀·금속성 텍스처를 빼고 색 텍스처를 2048px JPEG로 줄여 5MB 이하로 맞춘다 (round.glb와 같은 방식)
- 손잡이 마감: 라운드 = 흰 새틴 교차 감기 + 진주 핀 2개 / 크레센트 = 가운데에 짧게 감아 꽃 아래로 숨김, 핀 없음 / 내추럴·캐스케이드 = 미정

| 모양 | 꽃 | 파일 | 상태 |
|---|---|---|---|
| round | tulip-white | `round__tulip-white.glb` (3.3MB · 9.4만 tri) | ✓ Weave Tripo H3.1 (2026-11-19) |

## 준비 후 확인할 것
- [ ] 6개 파일이 `public/models/shapes/`에 있다
- [ ] 각 5MB 이하
- [ ] 브라우저에서 모양을 바꿔도 크기·위치가 튀지 않는다
- [ ] 정면 시점에서 모두 같은 방향을 본다
- [ ] (색 반영 시) material 이름이 규칙과 같다
