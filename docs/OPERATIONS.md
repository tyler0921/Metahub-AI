# MetaHub AI 운영 가이드

이 저장소의 운영 기준 경로는 `D:\PC_1M\project\AI Agent`입니다. 런타임 데이터, SQLite, 로그, 생성 결과도 이 경로 아래에 유지됩니다.

## 자동 시작과 상태 확인

프로덕션 빌드 후 Windows 로그인 자동 시작 작업을 설치합니다.

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-startup-task.ps1
Start-ScheduledTask -TaskName "MetaHub AI Company"
npm run runtime:status
```

감독기는 백엔드 `http://127.0.0.1:3000`과 프론트엔드 `http://127.0.0.1:5173`을 별도 Node 프로세스로 실행합니다. 프로세스가 종료되거나 백엔드 헬스 체크가 연속 실패하면 자동 재기동합니다. 중복 감독기는 Windows mutex로 차단합니다.

자동 시작을 제거하려면 다음 명령을 사용합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-startup-task.ps1
```

## 영속 데이터

기본 파일은 모두 Git에서 제외되는 `data/` 아래에 생성됩니다.

| 파일 | 용도 |
| --- | --- |
| `data/sessions.sqlite` | 세션 요약, 최종 결과, SSE 이벤트 기록 |
| `data/autonomous-work.json` | 자율 실행 횟수, 일시정지, 다음 실행 시각 |
| `data/autonomous-inbox.json` | 우선순위 백로그와 승인/반려 기록 |
| `data/llm-budget.json` | 일일 LLM 호출·토큰 사용량 |
| `data/logs/supervisor.log` | 감독기 시작·복구 기록 |

서버 재시작 시 완료 세션은 SQLite에서 다시 조회됩니다. 실행 중이던 세션은 안전하게 `failed`로 정리되고 중단 이벤트가 기록됩니다.

## 관리자 인증

`Backend/.env`의 `ADMIN_TOKEN`을 16자 이상으로 설정하면 모든 변경 API가 보호됩니다. 조회 API와 SSE는 계속 읽을 수 있습니다.

```dotenv
ADMIN_TOKEN=충분히-긴-로컬-관리자-토큰
```

프론트엔드에서 처음 업무 시작, 중단, 자율 제어, 백로그/승인 작업을 수행하면 토큰 입력창이 열립니다. 입력값은 해당 브라우저의 `localStorage`에만 저장되고 Git이나 서버 응답에 포함되지 않습니다.

## LLM 일일 예산

```dotenv
LLM_DAILY_CALL_LIMIT=200
LLM_DAILY_TOKEN_LIMIT=500000
```

`0`은 무제한입니다. 호출 한도 또는 누적 토큰 한도에 도달하면 다음 LLM 요청부터 HTTP 429로 차단됩니다. 상태는 `GET /api/config`의 `llmBudget`에서 확인할 수 있습니다.

## 자율 업무 백로그와 승인함

상단 상태바의 `업무함`에서 다음 흐름을 사용합니다.

1. 업무 내용과 우선순위(P1~P5)를 등록합니다.
2. 자율 실행은 가장 높은 우선순위의 대기 업무를 먼저 선택합니다.
3. 완료 결과는 `승인 대기`에 들어갑니다.
4. 승인하거나 반려 사유를 남깁니다.
5. 결정은 `data/autonomous-inbox.json`에 유지됩니다.

## 캐릭터와 맵 자산

- 기준 방향 시트: `docs/design/character-directions-v3.png`
- 생성 원본: `docs/design/character-directions-v3-source.png`
- 런타임 아틀라스: `Frontend/public/sprites/characters.png`
- 맵 단일 원본: `Frontend/src/data/office-map.json`

캐릭터는 8명, 방향은 `down/left/right/up`, 방향별 4프레임입니다. 다음 명령으로 재생성·검증합니다.

```powershell
npm --workspace @ai-company/frontend run sprites:characters
npm --workspace @ai-company/frontend run sprites:validate
npm --workspace @ai-company/frontend run map:validate
```

`office-map.json`에서 구역, 좌석, 회의 좌석, 스폰, 충돌 사각형을 수정할 수 있습니다. 빌드는 중복 구역 ID와 맵 바깥 좌표를 자동 차단합니다.

## 전체 검증

```powershell
npm run verify
npm run runtime:status
git status --short
```

`verify`는 전체 TypeScript 검사, 실제 Nest HTTP/SSE/인증/SQLite 재시작 E2E, 백로그·승인 복원 테스트, 프론트엔드 빌드, 맵·캐릭터 자산 검증을 수행합니다.
