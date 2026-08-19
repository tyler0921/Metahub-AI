import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { VaultEmbeddingStore } from '../dist/vault/embedding/vault-embedding.store.js';

function createStore(overrides = {}) {
  const config = {
    embeddingsEnabled: true,
    embeddingModel: 'nomic-embed-text',
    // 아무도 듣지 않는 포트 — 연결 실패 경로를 강제로 태웁니다
    embeddingBaseUrl: 'http://127.0.0.1:1',
    ...overrides,
  };
  return new VaultEmbeddingStore({
    getOrThrow(key) {
      assert.equal(key, 'vault');
      return config;
    },
  });
}

test('임베딩 서버에 연결하지 못하면 던지지 않고 null 을 돌려준다 (키워드 전용 폴백)', async () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'vault-embedding-test-'));
  const embeddingCachePath = join(tempDir, 'vault-embeddings.json');

  try {
    const store = createStore({ embeddingCachePath });
    store.onModuleInit();

    const notes = [{ relativePath: 'a.md', modifiedAt: new Date() }];
    const result = await store.similarities('질문', notes, () => '본문');
    assert.equal(result, null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('임베딩이 꺼져 있으면 서버를 호출하지 않고 즉시 null', async () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'vault-embedding-test-'));
  const embeddingCachePath = join(tempDir, 'vault-embeddings.json');

  try {
    const store = createStore({ embeddingsEnabled: false, embeddingCachePath });
    store.onModuleInit();

    const notes = [{ relativePath: 'a.md', modifiedAt: new Date() }];
    const result = await store.similarities('질문', notes, () => '본문');
    assert.equal(result, null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('후보 노트가 없으면 서버를 호출하지 않고 즉시 null', async () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'vault-embedding-test-'));
  const embeddingCachePath = join(tempDir, 'vault-embeddings.json');

  try {
    const store = createStore({ embeddingCachePath });
    store.onModuleInit();

    const result = await store.similarities('질문', [], () => '본문');
    assert.equal(result, null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
