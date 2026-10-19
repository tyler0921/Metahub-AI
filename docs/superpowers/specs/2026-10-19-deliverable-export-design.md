# 산출물 내보내기 (DOCX · PPTX · ZIP) — 설계

- 날짜: 2026-10-19
- 상태: 초안 (대표 검토 대기)
- 관련: `Deliverable`(shared/src/domain.d.ts), IntegratePhase(slides = Marp 마크다운), workspace/, 직원 1:1 대화 설계(2026-10-19-employee-chat-design.md)

## 1. 의도와 이유

지금은 산출물을 앱 안에서 보기만 할 수 있고 다운로드 기능이 전혀 없다. 대표는 산출물을 **받아서 Word·PowerPoint 에서 고쳐 쓰려고** 한다. 그래서 "보기 좋은 사본"이 아니라 **편집 가능한 원본 파일**이 목표다.

## 2. 목표 / 비목표 / 안티 목표

### 목표 (대표 결정)
- 산출물 종류별 내보내기:
  - `document` → **DOCX**
  - `slides` → **PPTX**
  - `website` → **ZIP**
- **편집 가능성 우선** — DOCX 는 Word 의 진짜 스타일(제목 1/2/3, 글머리 기호·번호 목록, 표, 굵게/기울임, 인용)로, PPTX 는 슬라이드마다 편집 가능한 텍스트 상자·표로. 그림으로 찍어 붙이지 않는다.
- **고정 양식 = MetaHub 분위기, 미니멀(A안)** — 목업 `.superpowers/brainstorm/.../export-template.html` A안:
  - 흰 바탕, 보라 `#5a50e6` 는 짧은 포인트 막대·소제목(h2) 색·워드마크에만
  - 본문 글자 먹색 `#202631`, 보조 글자 `#5f6670`, 구분선·표 테두리 `#e4dfd3`, 표 머리 행 배경 `#ece9e1`
  - 워드마크 = 텍스트 "MetaHub AI"(굵게, 보라) — 로고 이미지는 없음
  - **DOCX**: 표지(좌상단 워드마크 / 중앙 보라 짧은 막대 + 제목 + 참여 부서 / 하단 날짜·지시 번호) + 본문 페이지(머리글: 좌 워드마크, 우 문서 제목 / 바닥글: 좌 "MetaHub AI", 우 "n / 전체")
  - **PPTX**: 제목 슬라이드(좌상단 워드마크, 좌하단 보라 막대 + 제목 + 날짜) + 내용 슬라이드(제목 + 그 아래 보라 짧은 막대 + 본문, 바닥: 좌 워드마크, 우 페이지 번호), 16:9
- 산출물 패널(DeliverablePanel / DeliverableFocus / ArtifactPanel 중 산출물을 보여주는 곳)에 **"내보내기" 버튼**. 종류에 맞는 형식 하나로 바로 다운로드.

### 비목표
- PDF (*내 판단*: 고쳐 쓰는 용도와 안 맞음. 필요하면 Word/PowerPoint 에서 PDF 저장)
- 사용자 지정 템플릿·로고 업로드, 양식 선택 UI
- 문서를 PPTX 로/슬라이드를 DOCX 로 교차 변환
- 진행 중(미완료) 세션 내보내기

### 안티 목표
- 받은 파일이 Word/PowerPoint 에서 "복구" 경고를 띄우거나 열리지 않는다.
- 스타일 없이 직접 서식만 잔뜩 박혀 있어 Word 에서 제목 스타일·목차가 작동하지 않는다.
- 슬라이드가 이미지라 글자를 고칠 수 없다.
- 받는 사람 PC 에 서체가 없어 레이아웃이 깨진다.

## 3. 제약

- 레이어 규칙: Controller(입출력) / Service(도메인) / Formatter·Exporter(직렬화) — 변환 로직은 Controller 에 두지 않는다. 프론트는 `services/` 에서만 fetch.
- **내보내기 원본 = 세션 결과(`sessions.result_json` 의 `Deliverable`)**. 볼트 노트가 아니다 — 1:1 대화로 고친 현재 버전이 여기에 반영되기 때문.
- slides 본문은 **Marp 호환 마크다운**: 맨 앞 프론트매터(`---\nmarp: true\npaginate: true\n---`), 슬라이드는 `---` 한 줄로 구분, 슬라이드마다 제목(`#`/`##`) 하나 + 불릿 ≤5, 표 가능, 첫 장은 제목 슬라이드, 8~14장.
- website 는 `Deliverable.artifacts[]` + `workspace/<workspaceFolder>/` 실제 파일. (WorkspaceService 경로 검증 재사용)
- 서체: **맑은 고딕(Malgun Gothic)** — *내 판단*: 앱의 Pretendard 는 받는 PC 에 없을 가능성이 높다. 동아시아 글꼴 지정(eastAsia)까지 맞춘다.
- 다운로드는 GET 이라 AdminMutationGuard 를 통과하지 않지만, 보안 선행 작업(루프백 바인딩·CORS 기본값)이 적용된 상태를 전제로 한다.

## 4. 제안 설계 (빌더 재량 포함)

### 4.1 API
- `GET /api/sessions/:id/export` → 종류에 맞는 파일 스트림
  - `Content-Type`: docx `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, pptx `application/vnd.openxmlformats-officedocument.presentationml.presentation`, zip `application/zip`
  - `Content-Disposition: attachment; filename*=UTF-8''<인코딩된 한글 파일명>` — 파일명 = `YYYY-MM-DD <브리프 앞 40자 정제>.docx` 등
  - 세션 없음 404, 미완료/결과 없음 409, website 인데 `artifacts[]` 가 비어 있음 409
- 생성은 요청 시 즉석으로(캐시 없음) — 산출물이 작아서 충분히 빠르다.

### 4.2 백엔드 구성 (*내 판단*)
- 새 모듈 `export/`: `ExportController`, `ExportService`(종류 분기·파일명), `DocxExporter`, `PptxExporter`, `ZipExporter`, 공용 `metahub-theme.ts`(색·서체·크기 상수 한곳).
- 마크다운 → 중간 구조(블록 토큰) 변환은 **검증된 파서**로 (*내 판단*: `marked` 의 lexer). 직접 정규식 파서를 새로 짜지 않는다.
- 라이브러리 (*내 판단*): DOCX = `docx`, PPTX = `pptxgenjs`, ZIP = `jszip`(또는 `archiver`). 모두 Backend 의존성. 버전은 설치 시점 최신 안정판.

### 4.3 DOCX 매핑
- `#` → 제목 1, `##` → 제목 2(보라), `###` → 제목 3. 첫 `#` 은 표지 제목으로 쓰고 본문에서는 제외(*내 판단*; 없으면 브리프로 표지 제목).
- 문단·굵게·기울임·인라인 코드·링크(하이퍼링크), 글머리/번호 목록(중첩 1단계 이상 지원), 표(머리 행 배경 `#ece9e1`, 테두리 `#e4dfd3`), 인용(왼쪽 보라 테두리), 코드 블록(고정폭), 구분선.
- 스타일은 **문서 스타일 정의**로 넣고(문단마다 직접 서식 X) → Word 에서 스타일 변경·목차 생성이 된다.
- 표지 메타: 참여 부서(`plan.assignments` → 부서명), 날짜(세션 생성일, Asia/Seoul), "대표 지시 #" + 세션 id 앞 4자리.
- 리뷰(`review`) 점수·지적은 *내 판단*으로 **넣지 않는다** (내부용; 받아서 쓰는 문서에 섞이면 지워야 함).

### 4.4 PPTX 매핑
- 프론트매터 제거 → `---` 로 분할 → 첫 장은 제목 슬라이드 레이아웃, 나머지는 내용 슬라이드.
- 슬라이드 제목 = 그 장의 첫 `#`/`##`. 불릿 → 텍스트 상자 불릿(들여쓰기 수준 유지), 표 → 네이티브 표, 그 밖의 문단 → 본문 텍스트.
- 넘칠 때 *(내 판단)*: 슬라이드를 쪼개지 않는다. `pptxgenjs` 의 `fit: 'shrink'` 는 PowerPoint 가 열자마자 줄여 주지 않으므로(편집해야 반영), **서버가 본문 분량(줄 수·글자 수)을 추정해 글자 크기를 단계적으로 정한다**(예: 기본 → 한두 단계 축소, 하한 있음). `fit: 'shrink'` 도 함께 켜 둬 이후 편집 시 PowerPoint 가 이어서 맞추게 한다. 단계 기준 수치는 빌더 재량, 단위 테스트 포함.
- 마스터 슬라이드에 바닥 워드마크·페이지 번호를 넣어 고정 요소가 편집 중 실수로 지워지지 않게.

### 4.5 ZIP
- 최상위 폴더 1개(`<workspaceFolder>/`) 아래 `artifacts[]` 의 `path`/`content` 그대로. 경로는 WorkspaceService 와 같은 규칙으로 재검증(`..`·절대경로 거부).

### 4.6 프론트
- 산출물 패널 헤더에 "내보내기 (DOCX|PPTX|ZIP)" 버튼.
- *(내 판단)* 처음부터 **`services/` 의 http 클라이언트로 `fetch` → Blob → 임시 `<a download>` 클릭** 방식. 관리자 토큰 헤더가 자동으로 붙어, 보안 작업에서 GET 에 토큰을 요구하게 돼도 다시 짤 필요가 없다. 파일명은 응답의 `Content-Disposition` 에서 읽는다. 산출물이 수백 KB 이하라 메모리 부담 없음.
- 세션이 완료되지 않았으면 버튼 비활성 + 툴팁. 다운로드 중 버튼에 진행 표시, 실패 시 오류 토스트.

## 5. 수용 기준
- 완료된 document 세션 → DOCX 다운로드 → Word 에서 경고 없이 열림. 표지 + 머리글/바닥글(페이지 번호) + 제목 1/2 가 **스타일 목록에 실제 스타일로** 잡히고, "목차 삽입"이 동작한다. 한글 파일명 유지.
- 완료된 slides 세션 → PPTX → PowerPoint 에서 열림. 슬라이드 수 = `---` 구분 수, 제목 슬라이드 1장 + 내용 슬라이드, 모든 글자 편집 가능, 표는 네이티브 표, 16:9, 바닥 워드마크·번호.
- 완료된 website 세션 → ZIP → 풀면 `index.html` 을 바로 열 수 있음, `artifacts[]` 외 파일 없음, workspace 폴더를 지운 오래된 세션도 내보내짐.
- 내용이 많은 슬라이드는 PowerPoint 에서 처음 열었을 때부터 글자가 상자 안에 들어와 있다.
- 미완료 세션 409, 없는 세션 404.
- 1:1 대화로 고친 뒤 내보내면 고친 내용이 들어간다(대화 기능 구현 후).
- 백엔드 테스트(node --test): 각 exporter 가 유효한 OOXML/ZIP 을 만든다 — 결과를 `jszip` 으로 다시 열어 `word/document.xml`·`ppt/slides/slideN.xml` 존재, 제목 스타일 id, 슬라이드 수, 표 존재, 한글 텍스트 포함을 검사. 마크다운 매핑 단위 테스트(목록 중첩·표·인라인 서식).
- `npm run verify` 통과. 실제 Word/PowerPoint 열람은 수동 확인 1회(문서 1, 슬라이드 1).

## 6. 빌더에게 맡기는 것
- 글자 크기·여백·줄 간격 수치(목업 비율을 따르되 Office 기본에 가깝게)
- 정확한 라이브러리 선택 대안(위 제안과 동급이면 교체 가능)
- 파일명 정제 규칙 세부, 버튼 위치·아이콘
