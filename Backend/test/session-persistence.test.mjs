import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SessionRepository } from '../dist/workflow/repositories/session.repository.js';

test('SQLite session history survives repository recreation', () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'session-test-'));
  const databasePath = join(tempDir, 'sessions.sqlite');
  const config = {
    getOrThrow(key) {
      assert.equal(key, 'workflow');
      return { sessionTtlMs: 60_000, sessionDatabasePath: databasePath };
    },
  };

  try {
    const first = new SessionRepository(config);
    const session = first.create('restart persistence test');
    session.start();
    session.emit({ type: 'phase', phase: 'kickoff', label: 'Kickoff' });
    session.complete({
      sessionId: session.id,
      brief: session.brief,
      kind: 'document',
      body: 'restored result',
      artifacts: [],
      previewUrl: null,
      workspaceFolder: null,
      review: null,
      plan: {
        goal: 'Verify SQLite restore',
        successCriteria: ['The result remains available'],
        deliverable: 'Test result',
        kind: 'document',
        assignments: [],
      },
      team: [],
      vaultFolder: '',
      elapsedSeconds: 1,
      usage: { inputTokens: 10, outputTokens: 5, calls: 1 },
    });
    const id = session.id;
    first.onModuleDestroy();

    const restored = new SessionRepository(config);
    const detail = restored.findDetail(id);
    assert.equal(detail.session.status, 'completed');
    assert.equal(detail.result?.body, 'restored result');
    assert.equal(restored.findRecentSummaries()[0]?.id, id);
    const events = [];
    restored.findEvents(id).subscribe((event) => events.push(event));
    assert.deepEqual(events.map((event) => event.type), ['phase', 'done']);
    restored.onModuleDestroy();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
