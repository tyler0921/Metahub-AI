# IntelliJ IDEA 초기 세팅

NestJS 백엔드를 IntelliJ IDEA에서 돌리기 위한 설정입니다. 실행 설정은 `.run/` 에 미리 넣어뒀으니 프로젝트를 열면 상단 드롭다운에 바로 뜹니다.

---

## 0. 에디션 확인

IntelliJ IDEA **2026.1**부터 JavaScript·TypeScript 핵심 기능과 **package.json에서 npm 스크립트 실행**이 무료로 풀렸습니다. 하지만 **Node.js 디버거는 여전히 Ultimate 전용**입니다.

| | 무료(Community) | Ultimate |
| --- | --- | --- |
| TS 편집·자동완성·리팩터링 | ✅ | ✅ |
| npm 스크립트 실행 | ✅ | ✅ |
| 브레이크포인트 디버깅 | ❌ | ✅ |
| ESLint / Prettier 연동 | ✅ | ✅ |

디버깅이 필요 없다면 무료 버전으로 충분합니다. 필요하다면 Ultimate 30일 체험판이나 WebStorm을 쓰세요.

---

## 1. 프로젝트 열기 — ⚠️ 반드시 저장소 **루트**를 여세요

`File → Open` 에서 **`AI Agent` 폴더**(`Backend/`가 아니라)를 선택합니다.

`Backend/tsconfig.json`의 경로 별칭이 `../shared/src`를 가리키기 때문입니다. `Backend/`만 열면 IDE가 `shared/`를 인덱싱하지 못해 `@shared` import가 전부 빨간 줄로 표시됩니다. 빌드는 되는데 IDE만 에러를 뿜는 상태가 됩니다.

---

## 2. Node.js 인터프리터

`Settings → Languages & Frameworks → Node.js`

- **Node interpreter**: Node 20 이상 (없으면 `Download Node.js…`)
- **Package manager**: npm
- **Coding assistance for Node.js**: 체크

---

## 3. 의존성 설치

루트 `package.json`을 열고 상단의 **`npm install`** 알림을 누르거나, 터미널(`Alt+F12`)에서:

```bash
npm install
```

npm workspaces라 **루트에서 한 번**이면 `shared` / `Backend` / `Frontend`가 전부 설치됩니다. `Backend/`에 들어가서 따로 설치하지 마세요.

---

## 4. 환경변수 파일

`Backend/.env.example`을 복사해 **`Backend/.env`**를 만듭니다.

> Windows 탐색기는 `.`으로 시작하는 파일 생성을 막습니다. IDE에서 `Backend` 우클릭 → `New → File` → 이름에 `.env` 입력하면 됩니다.

최소 설정은 이 한 줄입니다.

```env
GEMINI_API_KEY=발급받은_키
```

키는 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 무료로 받습니다. 키가 없으면 mock 모드로 떠서 가짜 응답으로 동작합니다.

**`.env`는 `.gitignore`에 있습니다.** 커밋되지 않으니 안심하세요.

---

## 5. TypeScript 서비스

`Settings → Languages & Frameworks → TypeScript`

- **TypeScript**: `Backend/node_modules/typescript` 로 지정 (번들 버전 말고 프로젝트 버전)
- **TypeScript Language Service**: 체크

---

## 6. 인덱싱 제외 (선택, 체감 큼)

프로젝트 뷰에서 우클릭 → `Mark Directory as → Excluded`:

- `Backend/dist`
- `Frontend/dist`
- `vault` ← AI가 만든 마크다운이 계속 쌓이는 곳

---

## 7. 실행

상단 실행 설정 드롭다운에 `.run/`의 설정 4개가 자동으로 잡힙니다.

| 설정 | 하는 일 |
| --- | --- |
| **Backend dev** | `nest start --watch` — 코드 저장하면 자동 재시작 |
| **Backend debug (9229)** | 디버그 포트를 열고 실행 (Ultimate에서 브레이크포인트 사용) |
| **Frontend dev** | Vite 개발 서버 (HMR) |
| **All (Backend + Frontend)** | 위 둘을 한 번에 |

백엔드만 확인하려면 `Backend dev`를 실행하고 http://localhost:3000/api/health 를 열어보세요.

```json
{ "status": "ok", "uptime": 3, "version": "2.0.0" }
```

기동 로그에 이렇게 찍히면 정상입니다.

```
[LlmModule]  GeminiProvider 주입 (gemini-2.5-flash, 동시 2건 · 분당 10)
[Bootstrap]  API        http://localhost:3000/api
[Bootstrap]  Obsidian   C:\Users\...\AI Agent\vault\AI Company
```

전체 화면까지 보려면 `All`을 실행하고 http://localhost:5173 으로 접속합니다.

---

## 8. 디버깅 (Ultimate)

1. `Backend debug (9229)` 실행
2. `.ts` 파일 왼쪽 여백을 클릭해 브레이크포인트 설정
   - 추천 지점: `workflow.service.ts`의 `execute()`, `phases/feedback.phase.ts`의 `collect()`
3. 브라우저에서 지시를 내리면 그 줄에서 멈춥니다

`nest start --debug`가 소스맵을 켜므로 컴파일된 `dist/*.js`가 아니라 원본 `.ts`에서 멈춥니다.

---

## 자주 걸리는 문제

| 증상 | 원인과 해결 |
| --- | --- |
| `@shared` import가 빨간 줄 | `Backend/`만 열었을 때 발생. 저장소 루트를 다시 여세요 |
| `Cannot find module '@nestjs/core'` | 루트에서 `npm install`을 안 했거나 `Backend/`에서만 설치함 |
| `.env`를 안 읽음 | 실행 설정의 작업 디렉터리가 `Backend`가 아님. `.run/` 설정을 쓰면 자동으로 맞습니다 |
| 포트 3000 사용 중 | `Backend/.env`의 `PORT`를 바꾸고, `Frontend/.env`의 `VITE_API_PROXY_TARGET`도 같이 바꾸세요 |
| mock으로만 뜸 | `Backend/.env`에 `GEMINI_API_KEY`가 비어 있음. 기동 로그의 `[env]` 경고를 확인하세요 |
| 빌드는 되는데 IDE만 에러 | `File → Invalidate Caches… → Invalidate and Restart` |
| `Found 0 errors` 인데 `Cannot find module .../dist/main` | 남아 있는 `tsbuildinfo` 때문에 tsc가 "변경 없음"으로 판단해 출력을 건너뛴 경우입니다. `Backend`에서 `del *.tsbuildinfo` 후 재실행하세요 |
| 429 한도 초과 로그 | 정상 동작입니다. RateLimiter가 대기 후 재시도합니다. 잦으면 `FEEDBACK_ROUNDS=0` |

---

## 참고: 터미널만으로 돌리기

IDE 설정 없이도 됩니다.

```bash
npm install
npm run dev          # Backend + Frontend 동시
npm run dev:backend  # 백엔드만
```
