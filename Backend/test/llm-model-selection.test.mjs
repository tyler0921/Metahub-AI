import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const ADMIN_TOKEN = 'model-admin-token-123456';

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
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  return { app, baseUrl: `http://127.0.0.1:${address.port}/api` };
}

const postModel = (baseUrl, body, token = ADMIN_TOKEN) =>
  fetch(`${baseUrl}/llm/model`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

test('the model dropdown switches the provider and remembers it across restarts', async () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'llm-model-'));
  const selectionPath = join(tempDir, 'llm-selection.json');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    AI_PROVIDER: 'mock',
    ADMIN_TOKEN,
    // 테스트 PC 에 Ollama 가 떠 있어도 목록이 흔들리지 않게 닿지 않는 주소를 씁니다
    OLLAMA_BASE_URL: 'http://127.0.0.1:9',
    OLLAMA_MODEL: 'qwen3:8b',
    GEMINI_API_KEY: '',
    GROQ_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    AUTONOMOUS_WORK_ENABLED: 'false',
    LLM_SELECTION_STATE_PATH: selectionPath,
    SESSION_DATABASE_PATH: join(tempDir, 'sessions.sqlite'),
    LLM_BUDGET_STATE_PATH: join(tempDir, 'llm-budget.json'),
    AUTONOMOUS_WORK_STATE_PATH: join(tempDir, 'autonomous-work.json'),
    AUTONOMOUS_WORK_INBOX_PATH: join(tempDir, 'autonomous-inbox.json'),
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

    const listed = await (await fetch(`${first.baseUrl}/llm/models`)).json();
    assert.deepEqual(listed.current, { provider: 'mock', model: 'mock' });
    assert.equal(listed.locked, false);
    assert.deepEqual(listed.options, [
      { provider: 'ollama', model: 'qwen3:8b' },
      { provider: 'mock', model: 'mock' },
    ]);

    // 키가 없는 프로바이더와 관리자 토큰 없는 요청은 막힙니다
    assert.equal((await postModel(first.baseUrl, { provider: 'claude', model: 'claude-opus-5-5' })).status, 400);
    assert.equal((await postModel(first.baseUrl, { provider: 'ollama', model: 'qwen3:8b' }, null)).status, 401);
    assert.equal(existsSync(selectionPath), false);

    const switched = await postModel(first.baseUrl, { provider: 'ollama', model: 'qwen3:8b' });
    assert.equal(switched.status, 201);
    assert.deepEqual((await switched.json()).current, { provider: 'ollama', model: 'qwen3:8b' });

    const config = await (await fetch(`${first.baseUrl}/config`)).json();
    assert.equal(config.provider, 'ollama');
    assert.equal(config.model, 'qwen3:8b');
    assert.deepEqual(JSON.parse(readFileSync(selectionPath, 'utf8')), {
      version: 1,
      provider: 'ollama',
      model: 'qwen3:8b',
    });

    await first.app.close();
    first = null;

    second = await createTestApplication(AppModule, AllExceptionsFilter);
    const restored = await (await fetch(`${second.baseUrl}/llm/models`)).json();
    assert.deepEqual(restored.current, { provider: 'ollama', model: 'qwen3:8b' });
  } finally {
    await first?.app.close();
    await second?.app.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
