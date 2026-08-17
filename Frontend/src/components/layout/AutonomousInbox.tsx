import { useCallback, useEffect, useState } from 'react';
import type { AutonomousInboxResponse } from '@shared';
import { companyService } from '@/services/company.service';
import styles from './AutonomousInbox.module.css';

interface AutonomousInboxProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY_INBOX: AutonomousInboxResponse = { backlog: [], approvals: [] };

export function AutonomousInbox({ open, onClose }: AutonomousInboxProps): React.JSX.Element | null {
  const [inbox, setInbox] = useState(EMPTY_INBOX);
  const [brief, setBrief] = useState('');
  const [priority, setPriority] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInbox(await companyService.getAutonomousInbox());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '업무함을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const add = async (): Promise<void> => {
    if (brief.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      await companyService.addAutonomousBacklog(brief.trim(), priority);
      setBrief('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '업무를 추가하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await companyService.cancelAutonomousBacklog(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '업무를 취소하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, approved: boolean): Promise<void> => {
    const note = approved ? undefined : window.prompt('반려 사유를 입력하세요.') ?? undefined;
    setBusy(true);
    try {
      await companyService.decideAutonomousApproval(id, approved, note);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '승인 상태를 변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const queued = inbox.backlog.filter((item) => item.status === 'queued' || item.status === 'running');
  const approvals = inbox.approvals.filter((item) => item.status === 'pending');
  const history = inbox.approvals.filter((item) => item.status !== 'pending').slice(0, 5);

  return (
    <section className={styles.panel} aria-label="자율 업무함">
      <header>
        <div>
          <strong>자율 업무함</strong>
          <small>우선순위 백로그 · 결과 승인</small>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기">×</button>
      </header>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="AI 직원들이 알아서 처리할 업무를 적어주세요."
          maxLength={2_000}
        />
        <div>
          <label>
            우선순위
            <select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>
              <option value={5}>긴급</option>
              <option value={4}>높음</option>
              <option value={3}>보통</option>
              <option value={2}>낮음</option>
              <option value={1}>나중</option>
            </select>
          </label>
          <button type="submit" disabled={busy || brief.trim().length < 5}>백로그 추가</button>
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.sections}>
        <section>
          <h3>대기 업무 <b>{queued.length}</b></h3>
          {queued.length === 0 ? <p className={styles.empty}>등록된 대기 업무가 없습니다.</p> : (
            <ul>
              {queued.map((item) => (
                <li key={item.id}>
                  <span className={styles.priority}>P{item.priority}</span>
                  <p>{item.brief}</p>
                  {item.status === 'queued' ? (
                    <button type="button" disabled={busy} onClick={() => void cancel(item.id)}>취소</button>
                  ) : <em>진행 중</em>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>승인 대기 <b>{approvals.length}</b></h3>
          {approvals.length === 0 ? <p className={styles.empty}>검토할 결과가 없습니다.</p> : (
            <ul>
              {approvals.map((item) => (
                <li key={item.id} className={styles.approval}>
                  <p>{item.brief}</p>
                  <div>
                    <button type="button" disabled={busy} onClick={() => void decide(item.id, false)}>반려</button>
                    <button type="button" disabled={busy} onClick={() => void decide(item.id, true)}>승인</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {history.length > 0 && (
          <section>
            <h3>최근 결정</h3>
            <ul className={styles.history}>
              {history.map((item) => (
                <li key={item.id} data-status={item.status}>
                  <p>{item.brief}</p><em>{item.status === 'approved' ? '승인' : '반려'}</em>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
