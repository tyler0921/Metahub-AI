import { useEffect, useState } from 'react';
import { formatTodayLabel } from '@/lib/date';

/**
 * 오늘 날짜 라벨을 반환하고, 자정·분 변경 시 갱신합니다.
 */
export function useTodayLabel(): string {
  const [label, setLabel] = useState(() => formatTodayLabel(new Date()));

  useEffect(() => {
    const tick = (): void => setLabel(formatTodayLabel(new Date()));
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return label;
}
