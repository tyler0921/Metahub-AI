# 🏢 메타버스 AI 회사

대표(사용자)가 한 줄 지시를 내리면 **7명의 AI 직원**이 각자 부서에서 일하고, **서로 지적하고 반박하며** 산출물을 다듬은 뒤, 전 과정을 **Obsidian 볼트**에 마크다운으로 남깁니다.

2D 픽셀아트 오피스에서 아바타들이 실제로 동료 자리로 걸어가 말풍선을 띄우며 대화합니다.

---

## 🚀 빠른 시작

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

이 앱은 지시 1건당 LLM 을 10~15회 호출하고, 초안·교차검토 단계에서 부서 수만큼 동시에 요청이 나갑니다. 그래서 모든 호출이 `RateLimiter` 를 통과합니다.

1. **동시 실행 수**를 세마포어로 묶습니다 — Ollama 는 요청을 직렬 처리하므로 **1이 오히려 가장 빠릅니다.**
2. **분당 호출 수**를 슬라이딩 윈도로 제한합니다 (Ollama 는 무제한).
3. `429` 를 받으면 서버가 알려준 시간만큼 **모든** 호출을 함께 멈춥니다. 하나가 걸렸으면 나머지도 걸리므로, 개별 재시도보다 전체를 세우는 편이 빨리 회복됩니다.

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

---

## 📁 아키텍처

```
AI Agent/
├─ shared/                       📜 타입 전용 계약 (.d.ts) — 런타임 코드 없음
│   └─ src/{domain,events,api}.d.ts
│
├─ Backend/                      ⚙️  NestJS — 화면을 전혀 모름
│   └─ src/
│       ├─ main.ts                   부트스트랩 (CORS, ValidationPipe, 전역 필터)
│       ├─ app.module.ts
│       ├─ config/                   환경변수 로딩 + zod 검증
│       ├─ common/                   예외 필터 · 로깅 인터셉터
│       ├─ health/                   헬스체크
│       ├─ agents/                   AI 직원 도메인
│       │   ├─ agents.controller.ts / agents.service.ts / agents.module.ts
│       │   ├─ entities/             AgentEntity, OfficeMapEntity
│       │   ├─ dto/                  AgentIdParamDto
│       │   └─ data/agents.seed.ts   페르소나 시드
│       ├─ llm/                      LLM 인프라 (전략 패턴)
│       │   ├─ llm.service.ts        파사드 — 한도 대응·재시도·JSON 파싱
│       │   ├─ rate-limiter.ts       동시 실행 세마포어 + 분당 슬라이딩 윈도
│       │   ├─ errors/               LlmRateLimitError · LlmTransientError · LlmRequestError
│       │   ├─ interfaces/           LlmProvider 계약 + DI 토큰
│       │   ├─ providers/            OllamaProvider · GeminiProvider · GroqProvider
│       │   │                        · ClaudeProvider · MockProvider
│       │   └─ usage.tracker.ts      세션별 토큰 누적
│       ├─ vault/                    Obsidian 영속화
│       │   ├─ vault.controller.ts / vault.service.ts
│       │   ├─ repositories/         VaultRepository (파일 I/O 전담)
│       │   ├─ formatters/           NoteFormatter (마크다운 직렬화 전담)
│       │   ├─ entities/             VaultProjectEntity, VaultNoteEntity
│       │   └─ dto/
│       └─ workflow/                 SOP 파이프라인 ★ 핵심
│           ├─ workflow.controller.ts    REST + @Sse()
│           ├─ workflow.service.ts       단계 순서·반복만 결정
│           ├─ entities/                 WorkSessionEntity (애그리게이트 루트)
│           ├─ repositories/             SessionRepository (인메모리 + TTL 정리)
│           ├─ dto/                      CreateSessionDto, SessionIdParamDto
│           └─ phases/                   ← 각 단계가 독립 서비스
│               ├─ kickoff.phase.ts      착수
│               ├─ draft.phase.ts        초안
│               ├─ feedback.phase.ts     교차검토
│               ├─ revise.phase.ts       개정
│               ├─ integrate.phase.ts    통합
│               └─ review.phase.ts       검수
│
├─ Frontend/                     🖥️  React 19 + Vite — LLM도 파일도 모름
│   └─ src/
│       ├─ main.tsx / App.tsx
│       ├─ config/env.ts              환경변수를 읽는 유일한 곳
│       ├─ constants/                 단계 순서, 예시 지시문
│       ├─ services/                  ← 네트워크 코드는 여기에만
│       │   ├─ http.client.ts             fetch 래퍼 + ApiError
│       │   ├─ company.service.ts
│       │   ├─ vault.service.ts
│       │   └─ session-stream.service.ts  EventSource 구독
│       ├─ store/session.store.ts     zustand — 서버 이벤트를 상태로 환원
│       ├─ hooks/                     useCompanyConfig · useCompanySession · useVaultProjects
│       ├─ lib/markdown.ts            마크다운 → HTML
│       ├─ components/
│       │   ├─ layout/                TopBar, PhaseTrack
│       │   ├─ office/                ← 메타버스 오피스
│       │   │   ├─ office-map.ts          층 도면 (방·가구·충돌 격자)
│       │   │   ├─ office-renderer.ts     타일맵 렌더러 (React 비의존)
│       │   │   ├─ sprites.ts             스프라이트 로딩·틴팅
│       │   │   ├─ OfficeCanvas.tsx / NearbyCard.tsx / SpeechBubble.tsx
│       │   │   └─ useOfficeRenderer.ts   React 수명주기 연결
│       │   ├─ console/               CeoConsole
│       │   ├─ panels/                SidePanel, ConversationLog, DeliverablePanel, VaultPanel
│       │   └─ common/                Markdown, OfflineNotice
│       └─ (public/sprites/)          생성된 PNG 에셋
│
├─ Frontend/tools/generate_sprites.py    🎨 스프라이트 생성기 (파이썬)
│
└─ vault/                        📚 Obsidian 볼트 (기본 경로, 자동 생성)
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

`orchestrator.js` 하나가 전부 하던 구조를 이렇게 쪼갠 결과, 예를 들어 **저장소를 Obsidian 파일에서 Notion API로 바꾸려면 `VaultRepository` 하나만** 갈아끼우면 됩니다.

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

**접수와 구독을 분리한 이유**: `POST` 하나로 SSE를 내려주면 브라우저 표준 `EventSource`를 쓸 수 없어 fetch 스트림을 수동 파싱해야 합니다. 접수(`POST`)와 구독(`GET`)을 나누니 프론트가 `new EventSource(url)` 한 줄로 끝나고, 재접속·중복 구독 처리도 브라우저가 대신해 줍니다. 서버는 `ReplaySubject`를 쓰므로 구독이 늦어도 그 사이 이벤트를 놓치지 않습니다.

### SSE 이벤트

`SessionEvent`는 `shared/src/events.d.ts`에 정의된 **판별 유니온**입니다.

```ts
type SessionEvent =
  | BootEvent | PhaseEvent | StatusEvent | SpeechEvent
  | RecallEvent | PlanEvent | ReviewEvent
  | DoneEvent | CancelledEvent | ErrorEvent;
```

서버가 새 이벤트를 추가했는데 프론트가 처리하지 않으면 **컴파일 단계에서** 걸립니다. 런타임에 조용히 무시되는 일이 없습니다.

---

## ⏱️ 긴 작업을 견디게 하는 세 가지

로컬 모델은 지시 1건에 수 분이 걸립니다. 이 시간을 다루기 위한 장치들입니다.

**중단** — 콘솔의 `■ 중단` 버튼은 큐를 비우는 게 아니라 `AbortController` 로 **돌고 있는 LLM 요청까지 실제로 끊습니다.** 신호는 세션 → `LlmService` → 프로바이더의 `fetch` 까지 그대로 흘러갑니다. 중단은 실패가 아니므로 재시도하지 않고 `cancelled` 상태로 끝납니다. LLM 호출 사이에 끼는 볼트 저장 같은 작업은 신호를 받지 못하므로, 단계 경계마다 한 번씩 확인합니다.

**이어서 지시** — 산출물 패널의 `✍️ 이어서 지시하기` 를 누르면 그 세션이 부모가 됩니다. 비서실장이 받는 프롬프트에 **지난 산출물과 남은 지적**이 함께 들어가고, "처음부터 다시 만들지 말고 손이 필요한 부서만 고르라"는 지시가 붙습니다. 오타 하나 고치려고 전 부서를 다시 돌리지 않아도 됩니다.

**새로고침 복원** — 세션 id 만 `localStorage` 에 남깁니다. 새로고침하면 `GET /api/sessions/:id` 로 아직 살아 있는지 확인하고 스트림에 다시 붙습니다. 서버의 이벤트 스트림이 `ReplaySubject` 라서 **재구독만으로 그동안의 진행 상황이 전부 다시 흘러옵니다** — 복원용 코드를 따로 쓸 필요가 없습니다.

---

## 🏙️ 메타버스 오피스 (MetaHub AI)

맵은 **배경 이미지 한 장**(`Frontend/public/map/office.png`, 1672 × 941)입니다. ZEP·게더타운과 같은 방식으로, 코드는 타일을 조립하지 않고 **어디를 걸을 수 있는지 · 누가 어디에 서는지**만 정의합니다.

```
office-map.ts
├─ WALKABLE[]   걸을 수 있는 사각형 (방 바닥 · 복도 · 통로)
├─ BLOCKERS[]   그 안에서 가구가 막는 사각형
├─ ZONES[]      구역 이름 · 색 · 담당 직원 · 좌석 좌표
└─ findPath()   16px 격자 위 A* 경로 탐색
```

좌표는 전부 **이미지 픽셀**입니다. 맵 그림을 바꾸면 이 사각형들만 다시 재면 되고, 렌더러는 손대지 않습니다.

- **바닥을 클릭하면 그 지점까지 걸어갑니다.** 책상·벽을 피해 경로를 찾고 목적지에 링이 잠깐 뜹니다. `WASD`·방향키도 함께 동작합니다.
- **직원 곁(90px 이내)에 가면 카드가 뜹니다.** 그 부서의 현재 작업과 마지막 발언을 보여줍니다.
- **교차검토 단계에는 직원들이 회의실 원탁으로 모입니다.** 개정이 끝나면 각자 자리로 돌아갑니다.
- 이름표는 반투명 알약 + 부서 색 + 상태 점(파랑=작업 중, 노랑=대화 중, 초록=완료)이고, 아바타는 발밑 y 순으로 정렬되어 앞뒤가 자연스럽게 가려집니다.

> 직원 좌석은 프론트(`ZONES[].seat`)가 결정합니다. 백엔드의 `agent.desk` 는 더 이상 렌더링에 쓰이지 않습니다.

한 프레임에 그리는 이미지가 **9장**(배경 1 + 캐릭터 8)뿐이라, 타일맵 방식(936장)보다 훨씬 가볍습니다.

---

## 🎨 이전 타일맵 방식 (참고)

ZEP·게더타운 계열의 탑다운 오피스입니다. 에셋은 전부 `Frontend/tools/generate_sprites.py`가 코드로 그려 만들므로 외부 저작물이 들어가지 않습니다.

```bash
python Frontend/tools/generate_sprites.py   # 에셋 다시 생성 (색·비율 바꾼 뒤)
```

**오픈 플로어** (48 × 30 타일) — 벽으로 방을 나누지 않고, 바닥 러그와 가구로 구역을 구분합니다.

```
       [A]    [B]    [C]    [D]        ← 상단 유리 미팅 부스
  리서치팀    비서실       개발팀
  기획팀      마케팅팀     재무팀
  라운지      회의 공간    문서팀
```

- **바닥을 클릭하면 그 지점까지 걸어갑니다.** A* 경로 탐색으로 책상을 돌아가고, 목적지에는 링이 잠깐 표시됩니다. `WASD`·방향키도 함께 동작합니다.
- **직원 곁에 가면 카드가 뜹니다.** 그 부서가 지금 무슨 일을 하는지, 마지막 발언이 무엇인지 보여줍니다.
- **교차검토 단계에는 직원들이 회의 테이블로 모입니다.** 자리에 섰다가 개정이 끝나면 각자 책상으로 돌아갑니다.
- 이름표는 흰 알약 배지에 부서 색 텍스트 + 상태 점(파랑=작업 중, 주황=대화 중, 초록=완료)입니다. 책상에는 좌석 라벨이 붙습니다.
- 캐릭터는 4방향 × 4프레임 걷기 애니메이션이고, 가구와 사람은 y좌표로 깊이 정렬됩니다.

도면을 바꾸려면 `office-map.ts`의 `ZONES`·`propsFor()`만 고치면 됩니다. 단, **부서 좌석(`ZONES[].seat`)은 백엔드 `agents.seed.ts`의 `desk` 값과 일치**해야 합니다.

---

## 👥 AI 직원

| 직원 | 부서 | 전문성 |
| --- | --- | --- |
| 🗂️ 서예림 비서실장 | 비서실 | 지시 분해 · 부서 배정 · 최종 검수 |
| 🔍 박지우 팀장 | 리서치팀 | 시장·경쟁사 조사, 사실/추정 구분 |
| 📐 이도현 팀장 | 기획팀 | 목표 지표화, 로드맵, 리스크 |
| 📣 최유나 팀장 | 마케팅팀 | 포지셔닝, 메시지, 채널, 카피 |
| 💻 정민석 팀장 | 개발팀 | 기술 선택, 구현 계획, 공수 산정 |
| 📊 오세진 팀장 | 재무팀 | 예산, 원가, 수익성, 3개 시나리오 |
| ✍️ 강하린 팀장 | 문서팀 | 부서 원고를 하나의 문서로 재작성 |

직원을 추가하려면 `Backend/src/agents/data/agents.seed.ts`에 `AgentEntity` 하나를 넣고 `desk` 좌표만 주면 오피스 화면과 워크플로에 자동 편입됩니다. `systemPrompt`는 `toPublic()`에서 제외되므로 클라이언트로 새어 나가지 않습니다.

---

## 🔄 SOP 파이프라인

```
대표 지시
   │
0. 회상       볼트를 검색해 과거 기록을 찾아 전 부서 프롬프트에 주입   ← 공용 기억
1. 착수       목표·성공기준·투입 부서 결정               KickoffPhase
2. 초안       배정 부서들이 동시에 작성 (Promise.all)     DraftPhase
3. 교차검토   각 부서가 동료 초안을 읽고 특정 부서를 지목해 지적  FeedbackPhase ★
4. 개정       지적 반영. 동의 못 하면 "## 반론" 절에 이유    RevisePhase
5. 통합       한 사람 목소리로 재작성                    IntegratePhase
6. 검수       100점 만점 채점. 미달이면 반려 → 재작업       ReviewPhase
7. 보존       전 과정을 Obsidian 볼트에 저장
```

핵심은 **3~4단계**입니다. 결과를 이어붙이는 게 아니라, 재무팀이 마케팅팀 예산을 지적하고 개발팀이 기획팀 일정을 반박하면서 완성도가 올라갑니다. 라운드 수는 `FEEDBACK_ROUNDS`로 조절합니다.

---

## 📚 Obsidian 연동

`Backend/.env`의 `OBSIDIAN_VAULT`에 볼트 절대경로를 넣으면 실제 볼트에 직접 씁니다. 비워두면 저장소 루트의 `./vault`를 씁니다.

```
<볼트>/AI Company/
├─ _인덱스.md                    ← 전체 프로젝트 목록 (점수 포함)
└─ 프로젝트/2026-08-04 텀블러 브랜드 런칭/
   ├─ 00 개요.md                 ← 지시 · 목표 · 성공기준 체크박스 · 부서 배정표
   ├─ 01 회의록.md               ← 부서 간 오간 모든 대화 (시간순)
   ├─ 부서/리서치팀.md           ← 부서별 최종 원고
   ├─ 부서/마케팅팀.md
   └─ 산출물.md                  ← 최종 통합본 + 검수 의견
```

모든 노트에 YAML frontmatter(`type`, `date`, `status`, `score`, `tags`)와 위키링크가 들어가므로 그래프 뷰와 Dataview를 그대로 쓸 수 있습니다.

```dataview
TABLE score, status FROM #AI회사 WHERE type = "ai-company-deliverable" SORT date DESC
```

**공용 기억**: 다음 지시를 내리면 `VaultService.recall()`이 볼트 전체를 키워드 스코어링으로 검색해 관련 노트 발췌를 모든 부서 프롬프트에 넣습니다. 그래서 두 번째 프로젝트부터는 "지난번에 정한 브랜드 톤"을 기억한 채 일합니다.

---

## ⚙️ 설정 (`Backend/.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama` \| `gemini` \| `groq` \| `claude` \| `mock` |
| `OLLAMA_MODEL` | `qwen3:8b` | 로컬 모델명 |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 서버 주소 |
| `OLLAMA_TIMEOUT_MS` | `300000` | 한 호출 대기 시간 (첫 호출은 모델 로딩 포함) |
| `GEMINI_API_KEY` | — | [무료 발급](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini 모델명 |
| `GROQ_API_KEY` | — | [무료 발급](https://console.groq.com/keys) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq 모델명 |
| `ANTHROPIC_API_KEY` | — | Claude API 키 (유료) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Claude 모델명 |
| `LLM_MAX_CONCURRENT` | 프로바이더별 | 동시 호출 수 (Ollama 1 / Gemini 2 / Groq 1) |
| `LLM_REQUESTS_PER_MINUTE` | 프로바이더별 | 분당 상한, `0`이면 무제한 (Ollama 0 / Gemini 10 / Groq 4) |
| `LLM_MAX_RETRIES` | `3` | 429/5xx 재시도 횟수 |
| `OBSIDIAN_VAULT` | `../vault` | 볼트 절대경로 |
| `OBSIDIAN_ROOT` | `AI Company` | 볼트 내 하위 폴더명 |
| `CORS_ORIGIN` | `*` | 허용 오리진 (쉼표 구분) |
| `FEEDBACK_ROUNDS` | `1` | 교차검토 라운드 (0~3) |
| `MAX_REWORK` | `1` | 검수 반려 시 재작업 횟수 (0~3) |
| `SESSION_TTL_MS` | `3600000` | 완료 세션 메모리 보관 시간 |
| `PORT` | `3000` | 백엔드 포트 |

환경변수는 부팅 시 **zod로 검증**되므로 잘못 넣으면 조용히 오작동하지 않고 서버가 뜨지 않습니다.

프론트엔드는 `Frontend/.env`의 `VITE_API_PROXY_TARGET`으로 백엔드 주소를 정합니다. 개발 중에는 Vite 프록시가 `/api`를 넘겨주므로 CORS 없이 같은 오리진처럼 동작합니다.

---

## 확장 포인트

- **다른 LLM** — `LlmProvider` 인터페이스를 구현하고 `llm.module.ts`의 팩토리에 분기 하나 추가. 나머지 코드는 그대로입니다. Gemini를 붙일 때 실제로 바뀐 파일은 프로바이더 1개 + 팩토리 분기 1줄 + 설정뿐이었습니다.
  - 프로바이더는 재시도를 직접 하지 않습니다. `LlmRateLimitError` / `LlmTransientError` / `LlmRequestError` 중 하나를 던지면 `LlmService`가 대기·재시도를, `RateLimiter`가 전체 정지를 처리합니다.
  - JSON 강제 방식도 프로바이더가 알아서 번역합니다 — Claude는 assistant 프리필, Gemini는 `responseMimeType: application/json`.
- **DB 전환** — `SessionRepository` / `VaultRepository`의 메서드 시그니처만 유지하면 상위 계층은 무변경.
- **단계 추가** — `WorkflowPhase`를 구현한 서비스를 만들고 `workflow.service.ts` 흐름에 끼워 넣기.
- **UI 교체** — `office-renderer.ts`는 React를 전혀 모르는 순수 클래스입니다. three.js 3D로 바꿔도 백엔드·스토어는 그대로.
- **웹 검색** — 리서치팀에만 검색 도구를 붙이면 `[추정]` 태그가 실제 데이터로 바뀝니다.
