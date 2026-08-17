# 🏢 메타버스 AI 회사

대표(사용자)가 한 줄 지시를 내리면 **7개 부서 · 21명의 AI 직원**(팀장 7 + 팀원 14)이 각자 자리에서 일하고, **서로 지적하고 반박하며** 산출물을 다듬은 뒤, 전 과정을 **Obsidian 볼트**에 마크다운으로 남깁니다.

2D 픽셀아트 오피스에서 아바타들이 동료 자리로 걸어가 말풍선을 띄우며 대화합니다. 지시가 **문서형**이면 보고서·기획안을, **코드형**이면 브라우저에서 바로 열리는 HTML/CSS/JS 를 만듭니다.

---

## 🚀 빠른 시작

### 요구 사항

- **Node.js 20+** (권장: **22 LTS** — Node 24 는 Vite/Rollup 과 간헐적 충돌이 보고됩니다)
- **Ollama** (로컬 LLM, 기본 설정) 또는 클라우드 API 키

```bash
# 1. 의존성 설치 (npm workspaces — 루트에서 한 번이면 전부 설치됩니다)
npm install

# 2. 로컬 모델 준비 (API 키 불필요)
#    https://ollama.com/download 설치 후
ollama pull qwen3:8b

# 3. 설정 파일
cd Backend
copy .env.example .env       # macOS/Linux: cp .env.example .env
cd ..

# 4. 실행 (Backend + Frontend 동시)
npm run dev

# 5. 브라우저에서 http://localhost:5173
```

`.env.example` 은 **Ollama(로컬 모델)** 로 설정되어 있습니다. API 키도, 요청 한도도, 토큰 비용도 없습니다.

> **참고** — `npm run dev` 는 프론트가 백엔드보다 1~2초 먼저 뜹니다. 그 짧은 틈의 `ECONNREFUSED` 프록시 로그는 정상이며, 화면에는 "사무실 문을 여는 중…" 이 표시됩니다. 백엔드가 준비되면 자동으로 연결됩니다.

### LLM 프로바이더

| 프로바이더 | 키 | 한도 | 비고 |
| --- | --- | --- | --- |
| **Ollama** (기본) | 불필요 | 없음 | 내 PC 에서 실행. 속도는 하드웨어에 달림 |
| Gemini | [발급](https://aistudio.google.com/apikey) | ~1,500 RPD | ⚠️ 결제가 연결된 프로젝트는 무료 한도가 `0` 이 됩니다 |
| Groq | [발급](https://console.groq.com/keys) | 30 RPM · 12K TPM | 빠름. 분당 토큰이 먼저 걸립니다 |
| Claude | 유료 | — | 품질이 가장 좋음 |
| mock | — | — | AI 호출 없이 화면·파이프라인만 확인 |

`AI_PROVIDER` 로 고릅니다. 비워두면 키가 있는 쪽을 자동 선택하고(Gemini → Groq → Claude), 아무것도 없으면 `mock` 으로 뜹니다. Ollama 는 키가 없으므로 **`AI_PROVIDER=ollama` 를 명시**해야 합니다. (`.env.example` 에 이미 그렇게 되어 있습니다)

**Ollama 모델 고르기** — VRAM/RAM 기준입니다.

| 모델 | 크기 | 비고 |
| --- | --- | --- |
| `qwen3:8b` (기본) | ~5GB | 한국어가 가장 안정적 |
| `qwen3:4b` | ~3GB | 8GB RAM 노트북용. 품질은 조금 아래 |
| `gemma3:12b` | ~8GB | 여유가 있다면 |

첫 호출은 모델을 메모리에 올리느라 수십 초 걸립니다. 서버가 안 떠 있거나 모델을 안 받았으면 **오류 메시지에 해결 명령이 그대로 나옵니다.**

### 호출량 조절

이 앱은 지시 1건당 LLM 을 10~20회 호출하고, 초안·교차검토 단계에서 부서 수만큼 동시에 요청이 나갑니다. 그래서 모든 호출이 `RateLimiter` 를 통과합니다.

1. **동시 실행 수**를 세마포어로 묶습니다 — Ollama 는 요청을 직렬 처리하므로 **1이 오히려 가장 빠릅니다.**
2. **분당 호출 수**를 슬라이딩 윈도로 제한합니다 (Ollama 는 무제한).
3. `429` 를 받으면 서버가 알려준 시간만큼 **모든** 호출을 함께 멈춥니다.

느리거나 한도가 빠듯하면 `FEEDBACK_ROUNDS=0` 으로 두세요. 교차검토를 건너뛰어 호출이 절반 가까이 줄어듭니다(대신 부서 간 상호 검증이 사라집니다).

IntelliJ IDEA로 개발한다면 → **[docs/INTELLIJ.md](docs/INTELLIJ.md)** (실행 설정은 `.run/`에 들어 있습니다)

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Backend(3000) + Frontend(5173) 동시 실행 |
| `npm run dev:backend` | 백엔드만 watch 모드 |
| `npm run dev:frontend` | 프론트만 (HMR) |
| `npm run typecheck` | 양쪽 tsc 검사 |
| `npm run build` | 양쪽 프로덕션 빌드 |
| `npm run start:backend` | 빌드된 백엔드 실행 |
| `npm run preview` | 프론트 프로덕션 빌드 미리보기 |

---

## 📁 아키텍처

```
AI Agent/
├─ shared/                       📜 타입 전용 계약 (.d.ts) — 런타임 코드 없음
│   └─ src/{domain,events,api}.d.ts
│
├─ Backend/                      ⚙️  NestJS — 화면을 전혀 모름
│   └─ src/
│       ├─ main.ts                   부트스트랩 (CORS, ValidationPipe, /workspace 정적 서빙)
│       ├─ app.module.ts
│       ├─ config/                   환경변수 로딩 + zod 검증
│       ├─ common/                   예외 필터 · 로깅 인터셉터 · 날짜 유틸
│       ├─ health/                   헬스체크
│       ├─ agents/                   AI 직원 도메인 (팀장 + 팀원)
│       ├─ llm/                      LLM 인프라 (전략 패턴)
│       │   ├─ llm.service.ts        파사드 — 한도 대응·재시도·JSON 파싱
│       │   ├─ rate-limiter.ts       동시 실행 세마포어 + 분당 슬라이딩 윈도
│       │   └─ providers/            Ollama · Gemini · Groq · Claude · Mock
│       ├─ vault/                    Obsidian 영속화 (읽는 문서)
│       │   ├─ repositories/         VaultRepository (파일 I/O 전담)
│       │   └─ formatters/           NoteFormatter (마크다운 직렬화 전담)
│       ├─ workspace/                코드형 산출물 저장·서빙 ★ 신규
│       │   └─ workspace.service.ts  html/css/js 파일 I/O · 경로 검증 · 미리보기 URL
│       └─ workflow/                 SOP 파이프라인 ★ 핵심
│           ├─ workflow.controller.ts    REST + @Sse()
│           ├─ workflow.service.ts       단계 순서·반복·산출물 종류 분기
│           └─ phases/
│               ├─ kickoff.phase.ts      착수 (document / website 판정)
│               ├─ draft.phase.ts        초안
│               ├─ feedback.phase.ts     교차검토
│               ├─ revise.phase.ts       개정
│               ├─ integrate.phase.ts    통합 (문서형)
│               ├─ build.phase.ts        빌드 (코드형) ★ 신규
│               └─ review.phase.ts       검수
│
├─ Frontend/                     🖥️  React 19 + Vite — LLM도 파일도 모름
│   └─ src/
│       ├─ services/                  fetch · EventSource (여기에만)
│       ├─ store/session.store.ts     zustand — SSE 이벤트를 상태로 환원
│       ├─ hooks/                     useCompanyConfig · useCompanySession · …
│       ├─ components/
│       │   ├─ layout/                SessionStatusPill, WorkspaceSidebar
│       │   ├─ office/                메타버스 오피스 (Canvas · 말풍선 · office-staff)
│       │   ├─ console/               CeoConsole
│       │   ├─ panels/                ConversationLog, DeliverablePanel, ArtifactPanel, VaultPanel
│       │   └─ common/                BootingNotice, OfflineNotice, Markdown
│       └─ (public/map/, sprites/)    오피스 배경·스프라이트
│
├─ Frontend/tools/generate_sprites.mjs   🎨 스프라이트 생성기 (Node.js)
│
├─ vault/                        📚 Obsidian 볼트 (기본 경로, 자동 생성)
└─ workspace/                    🖥️  코드형 산출물 (랜딩페이지 등, 자동 생성)
```

### 계층 규칙

| 계층 | 하는 일 | 하지 않는 일 |
| --- | --- | --- |
| **Controller** | HTTP 입출력, DTO 검증 | 비즈니스 로직 |
| **Service** | 도메인 규칙, 단계 조율 | 파일 I/O, HTTP |
| **Repository** | 영속화 (파일시스템, 메모리) | 도메인 판단 |
| **Entity** | 상태 + 그 상태에 대한 규칙 | 외부 의존성 |
| **Formatter** | 도메인 → 마크다운 직렬화 | 저장 |
| **Provider** | 외부 API 호출 | 프롬프트 내용 결정 |

볼트(`vault/`)와 워크스페이스(`workspace/`)는 **의도적으로 분리**되어 있습니다. 볼트는 회사의 기억(마크다운)이고, 워크스페이스는 브라우저에서 돌아가는 실행 파일입니다. 섞으면 Obsidian 이 html/css 를 노트로 인식해 회상 결과가 오염됩니다.

---

## 🔌 API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/health` | 상태 확인 |
| `GET` | `/api/agents` | 직원 명단 + 오피스 맵 |
| `GET` | `/api/agents/:id` | 직원 1명 |
| `GET` | `/api/config` | 실행 환경 (비밀값 제외) |
| `POST` | `/api/sessions` | 대표 지시 접수 → `{ session, streamUrl }` |
| `POST` | `/api/sessions/:id/cancel` | 진행 중인 업무 중단 |
| `GET` | `/api/sessions` | 최근 세션 목록 |
| `GET` | `/api/sessions/:id` | 세션 상세 + 산출물 |
| `GET` | `/api/sessions/:id/events` | **SSE** 진행 스트림 |
| `GET` | `/api/vault/projects` | 볼트 프로젝트 목록 |
| `GET` | `/api/vault/notes?path=` | 노트 원문 |
| `GET` | `/workspace/{프로젝트}/…` | 코드형 산출물 정적 서빙 (API 접두사 밖) |

**접수와 구독을 분리한 이유**: `POST` 하나로 SSE를 내려주면 브라우저 표준 `EventSource`를 쓸 수 없습니다. 접수(`POST`)와 구독(`GET`)을 나누니 `new EventSource(url)` 한 줄로 끝나고, 서버의 `ReplaySubject` 덕에 구독이 늦어도 이벤트를 놓치지 않습니다.

개발 중 Vite 프록시가 `/api` 와 `/workspace` 를 백엔드로 넘기므로 CORS 없이 같은 오리진처럼 동작합니다.

### SSE 이벤트

`SessionEvent`는 `shared/src/events.d.ts`에 정의된 **판별 유니온**입니다.

```ts
type SessionEvent =
  | BootEvent | PhaseEvent | StatusEvent | SpeechEvent
  | RecallEvent | PlanEvent | ArtifactEvent | ReviewEvent
  | DoneEvent | CancelledEvent | ErrorEvent;
```

`ArtifactEvent` 는 코드형 산출물에서 파일 하나가 완성될 때마다 발생합니다. 파일 **내용**은 SSE 로 보내지 않고, `previewUrl` 로 iframe 미리보기를 갱신합니다.

---

## 📄 두 가지 산출물

비서실장이 착수 단계에서 지시를 **`document`** 또는 **`website`** 로 분류합니다.

| 종류 | 예시 지시 | 5단계 | 결과물 |
| --- | --- | --- | --- |
| **document** | "시장 조사 보고서 작성해줘" | 문서팀 **통합** (`IntegratePhase`) | 마크다운 보고서 |
| **website** | "랜딩페이지 만들어줘" | 개발팀 **빌드** (`BuildPhase`) | `index.html` + CSS/JS |

판정은 LLM JSON 과 키워드 규칙을 함께 봅니다. "랜딩페이지", "웹사이트", "HTML" 등이 들어가면 `website` 로, "보고서", "기획안", "분석해" 등이 들어가면 `document` 로 치우칩니다.

### 코드형 빌드 (`BuildPhase`)

- 파일 목록(작은 JSON)과 파일 내용(코드펜스)을 **분리**해서 받습니다 — 8B 로컬 모델이 HTML 을 JSON 문자열로 이스케이프하면 거의 실패하기 때문입니다.
- **파일 하나에 LLM 호출 하나** — 앞서 만든 파일을 다음 호출 컨텍스트로 넣어 서로 어긋나지 않게 합니다.
- 순수 HTML/CSS/JS 만 허용 (빌드 도구·CDN·외부 이미지 없음).
- 프로젝트당 최대 **6개 파일**, 확장자는 `.html` `.css` `.js` `.json` `.svg` `.txt` `.md`.
- 완성된 파일은 `workspace/` 에 저장되고 `/workspace/{폴더}/index.html` 로 바로 열립니다.

---

## ⏱️ 긴 작업을 견디게 하는 세 가지

로컬 모델은 지시 1건에 수 분이 걸립니다.

**중단** — `■ 중단` 버튼은 `AbortController` 로 **돌고 있는 LLM 요청까지 실제로 끊습니다.** 중단은 실패가 아니므로 재시도하지 않고 `cancelled` 로 끝납니다.

**이어서 지시** — 산출물 패널의 `✍️ 이어서 지시하기` 를 누르면 그 세션이 부모가 됩니다. 지난 산출물과 남은 지적이 프롬프트에 함께 들어갑니다.

**새로고침 복원** — 세션 id 만 `localStorage` 에 남깁니다. `ReplaySubject` 덕에 재구독만으로 진행 상황이 전부 다시 흘러옵니다.

---

## 🏙️ 메타버스 오피스 (MetaHub AI)

맵은 **Canvas 프로시저럴 렌더링**입니다. `generate_sprites.mjs` 로 만든 타일·가구 스프라이트를 `office-map.ts` 좌표에 맞춰 조립하고, **어디를 걸을 수 있는지 · 누가 어디에 서는지**만 코드로 정의합니다.

```
office-map.ts / office-staff.ts
├─ WALKABLE[]      걸을 수 있는 사각형
├─ BLOCKERS[]      가구가 막는 사각형
├─ ZONES[]         구역 · 팀장 좌석
├─ STAFF_SEATS[]   팀원 좌석 (14명)
└─ findPath()      16px 격자 A* 경로 탐색
```

- **바닥 클릭** → 그 지점까지 걸어감 (`WASD`·방향키 지원)
- **직원 곁(90px 이내)** → NearbyCard (현재 작업·마지막 발언)
- **교차검토 단계** → 회의실로 모였다가 개정 후 각자 자리로 복귀
- **팀장 7 + 팀원 14 = 21명** — 팀원도 백엔드 `agents.seed.ts` 에 등록되어 실제로 초안 작성에 참여합니다

> 직원 좌석은 프론트(`ZONES[].seat`, `STAFF_SEATS`)가 결정합니다.

스프라이트를 다시 그리려면:

```bash
npm --workspace @ai-company/frontend run sprites
# (= node Frontend/tools/generate_sprites.mjs)
```

---

## 👥 AI 직원

### 팀장 (부서 대표 · 교차검토 참여)

| 직원 | 부서 | 전문성 |
| --- | --- | --- |
| 🗂️ 서예림 비서실장 | 비서실 | 지시 분해 · 부서 배정 · 최종 검수 |
| 🔍 박지우 팀장 | 리서치팀 | 시장·경쟁사 조사, 사실/추정 구분 |
| 📐 이도현 팀장 | 기획팀 | 목표 지표화, 로드맵, 리스크 |
| 📣 최유나 팀장 | 마케팅팀 | 포지셔닝, 메시지, 채널, 카피 |
| 💻 정민석 팀장 | 개발팀 | 기술 선택, 구현·빌드, 공수 산정 |
| 📊 오세진 팀장 | 재무팀 | 예산, 원가, 수익성, 3개 시나리오 |
| ✍️ 강하린 팀장 | 문서팀 | 부서 원고를 하나의 문서로 재작성 |

각 부서마다 **선임·주니어 팀원 2명**이 추가로 등록되어 초안 작성에 참여합니다. 직원을 추가하려면 `Backend/src/agents/data/agents.seed.ts` 와 `Frontend/src/components/office/office-staff.ts` 좌석을 함께 맞추면 됩니다. `systemPrompt` 는 `toPublic()` 에서 제외되므로 클라이언트로 새어 나가지 않습니다.

---

## 🔄 SOP 파이프라인

```
대표 지시
   │
0. 회상       볼트 검색 → 과거 기록을 전 부서 프롬프트에 주입
1. 착수       목표·성공기준·투입 부서·산출물 종류(document/website) 결정
2. 초안       배정 부서(팀장+팀원)가 동시에 작성
3. 교차검토   각 부서가 동료 초안을 읽고 특정 부서를 지목해 지적  ★
4. 개정       지적 반영. 동의 못 하면 "## 반론" 절에 이유
5a. 통합      문서형 — 문서팀이 한 목소리로 재작성              IntegratePhase
5b. 빌드      코드형 — 개발팀이 실행 가능한 파일을 디스크에 작성  BuildPhase
6. 검수       100점 만점 채점. 미달이면 반려 → 5단계 재작업
7. 보존       회의록·산출물 요약을 Obsidian 볼트에 저장
              (코드 실물은 workspace/ 에, 볼트에는 파일 목록·미리보기 URL)
```

핵심은 **3~4단계**입니다. 라운드 수는 `FEEDBACK_ROUNDS`, 검수 반려 재작업은 `MAX_REWORK` 로 조절합니다.

---

## 📚 Obsidian 연동

`Backend/.env`의 `OBSIDIAN_VAULT`에 볼트 절대경로를 넣으면 실제 볼트에 직접 씁니다. 비워두면 저장소 루트의 `./vault`를 씁니다.

```
<볼트>/AI Company/
├─ _인덱스.md
└─ 프로젝트/2026-08-04 텀블러 브랜드 런칭/
   ├─ 00 개요.md
   ├─ 01 회의록.md
   ├─ 부서/리서치팀.md
   └─ 산출물.md          ← 문서형: 본문 전체 / 코드형: 파일 목록 + preview URL
```

**공용 기억**: `VaultService.recall()`이 볼트 전체를 키워드 스코어링으로 검색해 관련 노트 발췌를 모든 부서 프롬프트에 넣습니다.

---

## 🖥️ 워크스페이스 (코드형 산출물)

기본 경로: `./workspace/` ( `WORKSPACE_PATH` 로 변경 가능)

```
workspace/
└─ 2026-08-10-143022-랜딩페이지/
   ├─ index.html
   ├─ style.css
   └─ script.js
```

백엔드가 `/workspace/` 로 정적 서빙합니다. 프론트 `ArtifactPanel` 이 iframe 으로 **실물 페이지**를 띄우므로, 마크다운으로 옮겨 그리지 않아도 레이아웃 깨짐을 바로 확인할 수 있습니다.

---

## ⚙️ 설정 (`Backend/.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama` \| `gemini` \| `groq` \| `claude` \| `mock` |
| `OLLAMA_MODEL` | `qwen3:8b` | 로컬 모델명 |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 서버 주소 |
| `OLLAMA_TIMEOUT_MS` | `300000` | 한 호출 대기 시간 (첫 호출은 모델 로딩 포함) |
| `OLLAMA_NUM_CTX` | `16384` | 컨텍스트 창 (교차검토 시 프롬프트가 길어짐. VRAM 주의) |
| `GEMINI_API_KEY` | — | [무료 발급](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini 모델명 |
| `GROQ_API_KEY` | — | [무료 발급](https://console.groq.com/keys) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq 모델명 |
| `ANTHROPIC_API_KEY` | — | Claude API 키 (유료) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Claude 모델명 |
| `LLM_MAX_CONCURRENT` | 프로바이더별 | 동시 호출 수 (Ollama 1 / Gemini 2 / Groq 1) |
| `LLM_REQUESTS_PER_MINUTE` | 프로바이더별 | 분당 상한, `0`이면 무제한 |
| `LLM_MAX_RETRIES` | `3` | 429/5xx 재시도 횟수 |
| `OBSIDIAN_VAULT` | `../vault` | 볼트 절대경로 |
| `OBSIDIAN_ROOT` | `AI Company` | 볼트 내 하위 폴더명 |
| `WORKSPACE_PATH` | `../workspace` | 코드형 산출물 저장 경로 |
| `APP_TIMEZONE` | `Asia/Seoul` | 프로젝트 날짜·LLM "오늘" 기준 |
| `CORS_ORIGIN` | `*` | 허용 오리진 (쉼표 구분) |
| `FEEDBACK_ROUNDS` | `1` | 교차검토 라운드 (0~3) |
| `MAX_REWORK` | `1` | 검수 반려 시 재작업 횟수 (0~3) |
| `SESSION_TTL_MS` | `3600000` | 완료 세션 메모리 보관 시간 |
| `PORT` | `3000` | 백엔드 포트 |

환경변수는 부팅 시 **zod로 검증**됩니다.

프론트엔드는 `Frontend/.env`의 `VITE_API_PROXY_TARGET`(기본 `http://localhost:3000`)으로 백엔드 주소를 정합니다.

---

## 🛠️ 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `[vite] http proxy error: ECONNREFUSED` | 프론트가 백엔드보다 먼저 뜸 | 10~20초 기다리면 자동 연결. `BootingNotice` 표시 중이면 정상 |
| `EADDRINUSE :::3000` | 이전 dev 서버가 포트 점유 | 작업 관리자에서 `node.exe` 종료 후 재실행 |
| `npm error code 3221226505` (Vite) | Windows 네이티브 크래시 (Node 24 + Rollup 등) | **Node 22 LTS** 사용, 좀비 `node` 프로세스 정리, `node_modules` 재설치 |
| 포트 5173 이 다른 번호로 뜸 | 5173 점유 중 | 기존 Vite 종료 후 재실행 |

dev 서버를 여러 번 켰다면 **좀비 Node 프로세스**가 쌓일 수 있습니다. 터미널에서 `Ctrl+C` 로 모두 종료한 뒤, 포트 3000·5173 을 쓰는 프로세스가 없는지 확인하고 `npm run dev` 를 **한 번만** 실행하세요.

---

## 확장 포인트

- **다른 LLM** — `LlmProvider` 구현 + `llm.module.ts` 팩토리 분기 추가
- **다른 산출물 종류** — `DeliverableKind` 와 5단계 Phase 추가 (예: `slides`, `api-spec`)
- **DB 전환** — `SessionRepository` / `VaultRepository` 시그니처만 유지하면 상위 계층 무변경
- **단계 추가** — `WorkflowPhase` 구현 후 `workflow.service.ts` 흐름에 삽입
- **UI 교체** — `office-renderer.ts` 는 React 비의존. three.js 3D 로 바꿔도 백엔드·스토어는 그대로
- **웹 검색** — 리서치팀에만 검색 도구를 붙이면 `[추정]` 태그가 실제 데이터로 바뀝니다
