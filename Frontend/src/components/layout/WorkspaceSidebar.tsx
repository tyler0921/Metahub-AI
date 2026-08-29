import { useEffect, useRef, useState } from 'react';
import { AgentDetailPanel } from '@/components/panels/AgentDetailPanel';
import { CoPilotPanel } from '@/components/panels/CoPilotPanel';
import { DeliverablePanel } from '@/components/panels/DeliverablePanel';
import { TaskBoardPanel } from '@/components/panels/TaskBoardPanel';
import { VaultPanel } from '@/components/panels/VaultPanel';
import { UsagePanel } from '@/components/panels/UsagePanel';
import { WorkTimeline } from '@/components/panels/WorkTimeline';
import { useSessionStore } from '@/store/session.store';
import styles from './WorkspaceSidebar.module.css';

export type WorkspaceTabKey = 'tasks' | 'log' | 'result' | 'vault';

const TABS: ReadonlyArray<{ key: WorkspaceTabKey; label: string }> = [
  { key: 'tasks', label: '업무' },
  { key: 'log', label: '진행' },
  { key: 'result', label: '산출물' },
  { key: 'vault', label: '문서' },
];

interface WorkspaceSidebarProps {
  onSelectBrief: (brief: string) => void;
  embedded?: boolean;
  openTab?: WorkspaceTabKey;
  openRequestId?: number;
}

export function WorkspaceSidebar({
  onSelectBrief,
  embedded = false,
  openTab,
  openRequestId = 0,
}: WorkspaceSidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>('log');
  const [drawerOpen, setDrawerOpen] = useState(!embedded);
  const [unreadCount, setUnreadCount] = useState(0);
  const result = useSessionStore((s) => s.result);
  const isRunning = useSessionStore((s) => s.isRunning);
  const agents = useSessionStore((s) => s.agents);
  const selectedAgentId = useSessionStore((s) => s.selectedAgentId);
  const selectAgent = useSessionStore((s) => s.selectAgent);
  const logCount = useSessionStore((s) => s.logs.length);
  const workingCount = useSessionStore((s) =>
    [...s.avatars.values()].filter((avatar) =>
      avatar.status === 'thinking' || avatar.status === 'talking',
    ).length,
  );
  const prevLogCount = useRef(logCount);
  const prevRunning = useRef(isRunning);

  useEffect(() => {
    if (isRunning && !prevRunning.current) {
      setActiveTab('log');
      setDrawerOpen(true);
      setUnreadCount(0);
    }
    prevRunning.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (!result) return;
    setActiveTab('result');
    setDrawerOpen(true);
  }, [result]);

  useEffect(() => {
    const added = Math.max(0, logCount - prevLogCount.current);
    if (added > 0) {
      const logIsVisible = drawerOpen && activeTab === 'log';
      setUnreadCount((count) => logIsVisible ? 0 : count + added);
    }
    prevLogCount.current = logCount;
  }, [logCount, drawerOpen, activeTab]);

  useEffect(() => {
    if (!openTab || openRequestId === 0) return;
    setActiveTab(openTab);
    setDrawerOpen(true);
    // 레일에서 탭을 고른 건 "목록으로 돌아가겠다"는 뜻입니다
    selectAgent(null);
    if (openTab === 'log') setUnreadCount(0);
  }, [openTab, openRequestId, selectAgent]);

  // 캔버스에서 직원을 클릭하면 패널이 닫혀 있어도 열어 상세를 보여줍니다
  useEffect(() => {
    if (selectedAgentId) setDrawerOpen(true);
  }, [selectedAgentId]);

  const selectTab = (tab: WorkspaceTabKey): void => {
    setActiveTab(tab);
    if (tab === 'log') setUnreadCount(0);
  };

  if (!drawerOpen) {
    return (
      <aside className={`${styles.drawerClosed} sidebar`} aria-label="활동 패널">
        <button
          type="button"
          className={styles.drawerLauncher}
          aria-label="활동 패널 열기"
          onClick={() => {
            setDrawerOpen(true);
            if (activeTab === 'log') setUnreadCount(0);
          }}
        >
          <span className={styles.launcherIcon} aria-hidden="true">◫</span>
          <span>활동</span>
          {unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
      </aside>
    );
  }

  return (
    <aside className={`${styles.drawer} sidebar`} aria-label="활동 패널">
      <header className={styles.drawerHeader}>
        <div>
          <span className={styles.eyebrow}>PEOPLE & WORK</span>
          <strong>팀 활동</strong>
        </div>
        <div className={styles.headerMeta}>
          <span>
            <i className={isRunning ? styles.dotWorking : styles.dotOnline} />
            {isRunning ? `${workingCount}명 작업 중` : `${agents.length}명 온라인`}
          </span>
          <button type="button" aria-label="활동 패널 닫기" onClick={() => setDrawerOpen(false)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {/* 직원 상세를 보는 동안에는 탭을 숨깁니다 — 되돌아갈 길은 패널 안에 있습니다 */}
      {!selectedAgentId && (
        <div className={styles.tabs} role="tablist" aria-label="업무 보기">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? styles.activeTab : ''}
              onClick={() => selectTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'log' && unreadCount > 0 && <b>{unreadCount}</b>}
            </button>
          ))}
        </div>
      )}

      <div className={styles.body} role="tabpanel" data-scroll-root>
        {selectedAgentId ? (
          <AgentDetailPanel
            agentId={selectedAgentId}
            onBack={() => selectAgent(null)}
            onSelectBrief={onSelectBrief}
          />
        ) : (
          <>
            {activeTab === 'tasks' && <TaskBoardPanel />}
            {activeTab === 'log' && <WorkTimeline />}
            {activeTab === 'result' && <DeliverablePanel theme="light" />}
            {activeTab === 'vault' && <VaultPanel theme="light" />}
            <UsagePanel />
          </>
        )}
      </div>

      <CoPilotPanel
        className={styles.copilot}
        theme="light"
        onSelectBrief={onSelectBrief}
      />
    </aside>
  );
}
