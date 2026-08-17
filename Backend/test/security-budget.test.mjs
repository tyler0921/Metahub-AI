import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AdminMutationGuard } from '../dist/common/guards/admin-mutation.guard.js';
import { LlmBudgetService } from '../dist/llm/llm-budget.service.js';

const executionContext = (method, headers = {}) => ({
  switchToHttp: () => ({
    getRequest: () => ({
      method,
      header: (name) => headers[name.toLowerCase()],
    }),
  }),
});

test('admin guard protects mutations when a token is configured', () => {
  const guard = new AdminMutationGuard({
    getOrThrow: (key) => {
      assert.equal(key, 'security');
      return { adminToken: 'test-admin-token-1234' };
    },
  });

  assert.equal(guard.canActivate(executionContext('GET')), true);
  assert.throws(() => guard.canActivate(executionContext('POST')), /관리자 토큰/);
  assert.equal(
    guard.canActivate(
      executionContext('POST', { authorization: 'Bearer test-admin-token-1234' }),
    ),
    true,
  );
});

test('daily LLM budget persists and rejects calls over the limit', () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'budget-test-'));
  const budgetStatePath = join(tempDir, 'budget.json');
  const config = {
    getOrThrow: (key) => {
      assert.equal(key, 'llm');
      return { dailyCallLimit: 2, dailyTokenLimit: 100, budgetStatePath };
    },
  };

  try {
    const first = new LlmBudgetService(config);
    first.reserveCall();
    first.recordUsage({ inputTokens: 25, outputTokens: 15, calls: 1 });
    first.reserveCall();
    assert.throws(() => first.reserveCall(), /호출 한도/);

    const restored = new LlmBudgetService(config).snapshot();
    assert.equal(restored.calls, 2);
    assert.equal(restored.inputTokens + restored.outputTokens, 40);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
