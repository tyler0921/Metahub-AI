import { useCallback, useEffect, useState } from 'react';
import type { VaultProjectsResponse } from '@shared';
import { vaultService } from '@/services/vault.service';

interface VaultProjectsState {
  data: VaultProjectsResponse | null;
  isLoading: boolean;
  reload: () => void;
}

/** 볼트 프로젝트 목록. `reload()` 로 갱신합니다. */
export function useVaultProjects(reloadKey: unknown): VaultProjectsState {
  const [data, setData] = useState<VaultProjectsResponse | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const response = await vaultService.listProjects();
        if (!cancelled) setData(response);
      } catch {
        // 백엔드 미기동은 상위에서 이미 안내하므로 조용히 무시
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt, reloadKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, isLoading, reload };
}
