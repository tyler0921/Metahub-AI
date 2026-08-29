import { useCallback, useEffect, useState } from 'react';
import type { AutonomousWorkStatusResponse } from '@shared';
import { companyService } from '@/services/company.service';

interface AutonomousWorkBinding {
  status: AutonomousWorkStatusResponse | null;
  isBusy: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  runNow: () => Promise<void>;
}

const STATUS_REFRESH_MS = 10_000;

export function useAutonomousWork(): AutonomousWorkBinding {
  const [status, setStatus] = useState<AutonomousWorkStatusResponse | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await companyService.getAutonomousWorkStatus());
      setError(null);
    } catch {
      setError('자율 운영 상태를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!status?.configured || isBusy) return;
    setBusy(true);
    try {
      setStatus(
        status.paused
          ? await companyService.resumeAutonomousWork()
          : await companyService.pauseAutonomousWork(),
      );
      setError(null);
    } catch {
      setError('자율 운영 상태를 변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [status, isBusy]);

  const runNow = useCallback(async (): Promise<void> => {
    if (!status?.enabled || isBusy || status.activeSession) return;
    setBusy(true);
    try {
      setStatus(await companyService.runAutonomousWorkNow());
      setError(null);
    } catch {
      setError('자율 업무를 시작하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [status, isBusy]);

  return { status, isBusy, error, toggle, runNow };
}
