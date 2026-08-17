import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const ADMIN_TOKEN = 'e2e-admin-token-123456';

async function createTestApplication(AppModule, AllExceptionsFilter) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  return { app, baseUrl: `http://127.0.0.1:${address.port}/api` };
}

async function waitForCompletion(baseUrl, sessionId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/sessions/${sessionId}`);
    assert.equal(response.status, 200);
    const detail = await response.json();
    if (['completed', 'failed', 'cancelled'].includes(detail.session.status)) return detail;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('The mock workflow did not finish before the E2E deadline.');
}

test('authenticated HTTP workflow streams and survives an application restart', async () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'api-e2e-'));

  Object.assign(process.env, {
    NODE_ENV: 'test',
    AI_PROVIDER: 'mock',
    ADMIN_TOKEN,
    AUTONOMOUS_WORK_ENABLED: 'false',
    FEEDBACK_ROUNDS: '0',
    MAX_REWORK: '0',
    WORKFLOW_REFLECT: 'false',
    SESSION_DATABASE_PATH: join(tempDir, 'sessions.sqlite'),
    LLM_BUDGET_STATE_PATH: join(tempDir, 'llm-budget.json'),
    AUTONOMOUS_WORK_STATE_PATH: join(tempDir, 'autonomous-work.json'),
    OBSIDIAN_VAULT: join(tempDir, 'vault'),
    WORKSPACE_PATH: join(tempDir, 'workspace'),
  });

  const [{ AppModule }, { AllExceptionsFilter }] = await Promise.all([
    import('../dist/app.module.js'),
    import('../dist/common/filters/all-exceptions.filter.js'),
  ]);

  let first;
  let second;
  try {
    first = await createTestApplication(AppModule, AllExceptionsFilter);

    const health = await fetch(`${first.baseUrl}/health`);
    assert.equal(health.status, 200);

    const config = await (await fetch(`${first.baseUrl}/config`)).json();
    assert.equal(config.adminAuthRequired, true);
    assert.equal(config.llmBudget.dailyCallLimit, 200);

    const rejected = await fetch(`${first.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'unauthorized E2E request' }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(`${first.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ brief: 'Create a concise integration test report.' }),
    });
    assert.equal(accepted.status, 201);
    const created = await accepted.json();

    const detail = await waitForCompletion(first.baseUrl, created.session.id);
    assert.equal(detail.session.status, 'completed');
    assert.equal(detail.result.sessionId, created.session.id);

    const stream = await fetch(`${first.baseUrl}/sessions/${created.session.id}/events`);
    assert.equal(stream.status, 200);
    const eventText = await stream.text();
    assert.match(eventText, /"type":"done"/);

    await first.app.close();
    first = undefined;

    second = await createTestApplication(AppModule, AllExceptionsFilter);
    const restored = await fetch(`${second.baseUrl}/sessions/${created.session.id}`);
    assert.equal(restored.status, 200);
    const restoredDetail = await restored.json();
    assert.equal(restoredDetail.session.status, 'completed');
    assert.equal(restoredDetail.result.sessionId, created.session.id);
  } finally {
    if (first) await first.app.close();
    if (second) await second.app.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
