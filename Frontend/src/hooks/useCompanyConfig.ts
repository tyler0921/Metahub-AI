import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfigResponse, OfficeMap } from '@shared';
import { companyService } from '@/services/company.service';
import { ApiError } from '@/services/http.client';
import { useSessionStore } from '@/store/session.store';

interface CompanyConfigState {
  office: OfficeMap | null;
  config: AppConfigResponse | null;
  isLoading: boolean;
  error: string | null;
  /** 백엔드를 기다리며 자동으로 다시 시도하는 중 */
  isWaitingForServer: boolean;
  retry: () => void;
}

/**
 * 백엔드가 뜰 때까지 자동으로 기다리는 횟수.
 *
 * `npm run dev` 로 켜면 프론트가 백엔드보다 1~2초 먼저 뜹니다.
 * 그때마다 사용자가 재시도 버튼을 눌러야 한다면 불편하므로,
 * 잠깐은 조용히 기다렸다 스스로 다시 붙습니다.
 */
const AUTO_RETRY_LIMIT = 8;
const AUTO_RETRY_DELAY_MS = 1000;

/** 부팅 시 직원 명단·오피스 맵·실행 환경을 한 번에 받아옵니다. */
export function useCompanyConfig(): CompanyConfigState {
  const setAgents = useSessionStore((s) => s.setAgents);

  const [office, setOffice] = useState<OfficeMap | null>(null);
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWaitingForServer, setWaitingForServer] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // 자동 재시도 횟수는 렌더와 무관하므로 ref 로 둡니다
  const autoRetries = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const [agentsRes, configRes] = await Promise.all([
          companyService.getAgents(),
          companyService.getConfig(),
        ]);
        if (cancelled) return;
        setAgents(agentsRes.agents);
        setOffice(agentsRes.office);
        setConfig(configRes);
        setWaitingForServer(false);
        autoRetries.current = 0;
      } catch (err) {
        if (cancelled) return;

        // 서버가 아직 안 뜬 것뿐이라면 오류 화면 대신 조용히 기다립니다.
        // 백엔드가 제대로 응답한 오류(400 등)는 기다려도 소용없으므로 바로 알립니다.
        const isServerAsleep =
          err instanceof ApiError &&
          err.isServerUnreachable &&
          autoRetries.current < AUTO_RETRY_LIMIT;

        if (isServerAsleep) {
          autoRetries.current += 1;
          setWaitingForServer(true);
          timer = setTimeout(() => setAttempt((n) => n + 1), AUTO_RETRY_DELAY_MS);
          return;
        }

        setWaitingForServer(false);
        setError(
          err instanceof ApiError ? err.message : '설정을 불러오지 못했습니다.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [setAgents, attempt]);

  const retry = useCallback(() => {
    autoRetries.current = 0;
    setAttempt((n) => n + 1);
  }, []);

  return { office, config, isLoading, error, isWaitingForServer, retry };
}
