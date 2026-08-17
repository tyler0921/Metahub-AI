import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AutonomousInboxStore } from '../dist/workflow/autonomous-inbox.store.js';

test('autonomous inbox prioritizes backlog and persists approval decisions', () => {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const tempDir = mkdtempSync(join(dataDir, 'inbox-test-'));
  const inboxPath = join(tempDir, 'inbox.json');
  const config = {
    getOrThrow(key) {
      assert.equal(key, 'autonomousWork');
      return { inboxPath };
    },
  };

  try {
    const first = new AutonomousInboxStore(config);
    first.enqueue('normal priority task', 3);
    const urgent = first.enqueue('urgent priority task', 5);
    assert.equal(first.nextQueued()?.id, urgent.id);

    first.markStarted(urgent.id, 'session-1');
    first.markFinished(urgent.id, true);
    const approval = first.requestApproval('session-1', urgent.brief);
    first.decide(approval.id, true, 'looks good');

    const restored = new AutonomousInboxStore(config).snapshot();
    assert.equal(restored.backlog.find((item) => item.id === urgent.id)?.status, 'completed');
    assert.equal(restored.approvals[0]?.status, 'approved');
    assert.equal(restored.approvals[0]?.note, 'looks good');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
