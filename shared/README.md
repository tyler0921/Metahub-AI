# @ai-company/shared

Backend 와 Frontend 가 **같은 API 계약**을 바라보게 하는 타입 전용 패키지입니다.

## 왜 `.d.ts` 인가

이 패키지의 파일은 전부 선언 파일(`.d.ts`)입니다. 런타임 코드가 한 줄도 없다는 뜻이고, 덕분에

- Backend(`tsc` → `dist/`)가 컴파일할 때 이 파일들을 **출력 대상으로 잡지 않습니다.** (`rootDir` 충돌 없음)
- Frontend(Vite)에서도 타입은 빌드 시 완전히 소거되어 번들에 아무것도 들어가지 않습니다.
- 별도의 빌드 순서나 `npm run build` 오케스트레이션이 필요 없습니다.

**그래서 여기에 상수·클래스·enum 같은 런타임 값을 넣으면 안 됩니다.** 그런 값이 필요하면 각 앱의 `constants/` 에 두세요.

## 구성

| 파일 | 내용 |
| --- | --- |
| `domain.d.ts` | 도메인 모델 — Agent, WorkPlan, ReviewResult, Deliverable 등 |
| `events.d.ts` | SSE 이벤트 판별 유니온 — `SessionEvent` |
| `api.d.ts` | REST 요청/응답 형태 |

## 사용법

양쪽 `tsconfig.json` 에 경로 별칭이 걸려 있습니다.

```ts
import type { SessionEvent, Deliverable } from '@shared';
```

`SessionEvent` 는 판별 유니온이라 `switch (event.type)` 에서 타입이 자동으로 좁혀지고, 서버가 새 이벤트를 추가했는데 프론트가 처리하지 않으면 컴파일 단계에서 걸립니다.
