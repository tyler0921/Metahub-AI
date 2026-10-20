import { useVaultProjects } from '@/hooks/useVaultProjects';
import { useSessionStore } from '@/store/session.store';
import styles from './VaultPanel.module.css';

export function VaultPanel({
  theme = 'light',
}: {
  theme?: 'light' | 'sidebar';
}): React.JSX.Element {
  const result = useSessionStore((s) => s.result);
  const { data, isLoading } = useVaultProjects(result?.sessionId ?? null);
  const isSidebar = theme === 'sidebar';

  if (isLoading && !data) {
    return (
      <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
        불러오는 중…
      </p>
    );
  }

  if (!data) {
    return (
      <p className={`${styles.empty} ${isSidebar ? styles.sidebarEmpty : ''}`}>
        문서 목록을 불러오지 못했습니다. 백엔드 서버가 켜져 있는지 확인한 뒤 다시 열어 주세요.
      </p>
    );
  }

  return (
    <div className={isSidebar ? styles.sidebarRoot : undefined}>
      <p className={styles.path} title="Obsidian 저장 위치">{data.basePath}</p>

      {data.projects.length === 0 ? (
        <p className={styles.empty}>아직 저장된 문서가 없습니다. 업무가 끝나면 결과가 여기와 Obsidian에 자동으로 저장됩니다.</p>
      ) : (
        <ul className={styles.list}>
          {data.projects.map((project) => (
            <li key={project.folder} className={styles.item}>
              <span className={styles.date}>{project.date}</span>
              <span className={styles.title}>{project.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
