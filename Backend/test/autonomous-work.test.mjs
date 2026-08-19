import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUTONOMOUS_BRIEFS,
  chooseAutonomousBrief,
} from '../dist/workflow/autonomous-work.service.js';
import {
  AutonomousStateStore,
  localDayKey,
} from '../dist/workflow/autonomous-state.store.js';
import { AutonomousBriefPlannerService } from '../dist/workflow/autonomous-brief-planner.service.js';

function createPlanner(completeJson) {
  return new AutonomousBriefPlannerService(
    { completeJson },
    { findRecentSummaries: () => [] },
    { chief: { systemPrompt: '테스트용 비서실장 페르소나' } },
  );
}

function createStore(statePath) {
  return new AutonomousStateStore({
    getOrThrow(key) {
      assert.equal(key, 'autonomousWork');
      return { statePath };
    },
  });
}

test('자율 업무 상태가 서버 인스턴스 사이에 유지된다', () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'autonomous-test-'));
  const statePath = join(tempDir, 'state.json');

  try {
    const first = createStore(statePath);
    // 오늘로 기록해야 두 번째 스토어의 syncDay 가 날짜 변경으로 오해해
    // runsToday 를 0 으로 초기화하지 않습니다 (이 테스트는 '유지'를 검증합니다)
    first.recordRun(AUTONOMOUS_BRIEFS[0], 'session-1');
    first.recordFailure();
    first.setPaused(true);

    const restored = createStore(statePath).snapshot();
    assert.equal(restored.runsToday, 1);
    assert.equal(restored.lastSessionId, 'session-1');
    assert.equal(restored.consecutiveFailures, 1);
    assert.equal(restored.paused, true);
    assert.deepEqual(restored.recentBriefs, [AUTONOMOUS_BRIEFS[0]]);
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).version, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('날짜가 바뀌면 일일 횟수와 연속 실패가 초기화된다', () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'autonomous-test-'));
  const statePath = join(tempDir, 'state.json');

  try {
    const store = createStore(statePath);
    store.recordRun(AUTONOMOUS_BRIEFS[0], 'session-1');
    store.recordFailure();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    store.syncDay(tomorrow);
    const state = store.snapshot();
    assert.equal(state.dayKey, localDayKey(tomorrow));
    assert.equal(state.runsToday, 0);
    assert.equal(state.consecutiveFailures, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('최근에 수행하지 않은 자율 과제를 우선 선택한다', () => {
  assert.equal(chooseAutonomousBrief([]), AUTONOMOUS_BRIEFS[0]);
  assert.equal(chooseAutonomousBrief([AUTONOMOUS_BRIEFS[0]]), AUTONOMOUS_BRIEFS[1]);
  assert.equal(
    chooseAutonomousBrief([AUTONOMOUS_BRIEFS[0], AUTONOMOUS_BRIEFS[1]]),
    AUTONOMOUS_BRIEFS[2],
  );
});

test('브리프 플래너는 LLM 호출이 실패하면 고정 순환으로 대체한다', async () => {
  const planner = createPlanner(async () => {
    throw new Error('llm down');
  });

  assert.equal(await planner.plan([]), AUTONOMOUS_BRIEFS[0]);
});

test('브리프 플래너는 이상한 응답(빈 문자열)도 고정 순환으로 대체한다', async () => {
  const planner = createPlanner(async () => ({ brief: '   ' }));

  assert.equal(await planner.plan([]), AUTONOMOUS_BRIEFS[0]);
});

test('브리프 플래너는 유효한 LLM 제안을 그대로 쓴다', async () => {
  const proposed = '[자율 업무] 최근 실패한 랜딩페이지 빌드를 재검토하고 원인을 고쳐줘.';
  const planner = createPlanner(async () => ({ brief: proposed }));

  assert.equal(await planner.plan([]), proposed);
});

test('브리프 플래너는 최근에 낸 과제를 그대로 반복하면 고정 순환으로 대체한다', async () => {
  const planner = createPlanner(async () => ({ brief: AUTONOMOUS_BRIEFS[0] }));

  assert.equal(await planner.plan([AUTONOMOUS_BRIEFS[0]]), AUTONOMOUS_BRIEFS[1]);
});
