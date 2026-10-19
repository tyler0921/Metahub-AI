import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { AgentDetailPanel } from '@/components/panels/AgentDetailPanel';
import { CoPilotPanel } from '@/components/panels/CoPilotPanel';
import { DeliverablePanel } from '@/components/panels/DeliverablePanel';
import { TaskBoardPanel } from '@/components/panels/TaskBoardPanel';
import { VaultPanel } from '@/components/panels/VaultPanel';
import { UsagePanel } from '@/components/panels/UsagePanel';
import { WorkTimeline } from '@/components/panels/WorkTimeline';
import { useSessionStore } from '@/store/session.store';
import { WORKSPACE_TABS, useUiStore, type WorkspaceTabKey } from '@/store/ui.store';
import styles from './WorkspaceSidebar.module.css';

export type { WorkspaceTabKey } from '@/store/ui.store';

interface WorkspaceSidebarProps {
  onSelectBrief: (brief: string) => void;
  embedded?: boolean;
}

export function WorkspaceSidebar({
  onSelectBrief,
  embedded = false,
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
  const panelRequest = useUiStore((s) => s.panelRequest);
  const setOpenPanel = useUiStore((s) => s.setOpenPanel);
  const inboxOpen = useUiStore((s) => s.inboxOpen);
  const inboxCount = useUiStore((s) => s.inboxCount);
  const setInboxOpen = useUiStore((s) => s.setInboxOpen);
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
    if (panelRequest.id === 0) return;
    if (panelRequest.tab === 'office') {
      setDrawerOpen(false);
      return;
    }
    setActiveTab(panelRequest.tab);
    setDrawerOpen(true);
    // 메뉴에서 탭을 고른 건 "목록으로 돌아가겠다"는 뜻입니다
    selectAgent(null);
    if (panelRequest.tab === 'log') setUnreadCount(0);
  }, [panelRequest, selectAgent]);

  // 상단 탭이 지금 열린 패널을 표시할 수 있게 알려 줍니다
  useEffect(() => {
    setOpenPanel(drawerOpen ? activeTab : null);
  }, [drawerOpen, activeTab, setOpenPanel]);

  // 캔버스에서 직원을 클릭하면 패널이 닫혀 있어도 열어 상세를 보여줍니다
  useEffect(() => {
    if (selectedAgentId) setDrawerOpen(true);
  }, [selectedAgentId]);

  const selectTab = (tab: WorkspaceTabKey): void => {
    setActiveTab(tab);
    if (tab === 'log') setUnreadCount(0);
  };

  /** WAI-ARIA 탭 패턴 — 화살표로 옮기고 Home/End 로 양끝. 옮기는 즉시 선택합니다 */
  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = WORKSPACE_TABS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    const tab = WORKSPACE_TABS[next]!;
    selectTab(tab.key);
    document.getElementById(`workspace-tab-${tab.key}`)?.focus();
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
          <Icon name="users" size={20} />
          <span>활동</span>
          {unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
        {/* 알림 = 자율 업무함. 승인을 기다리는 일이 여기 쌓입니다 */}
        <button
          type="button"
          className={styles.drawerLauncher}
          aria-label="알림(자율 업무함) 열기"
          aria-expanded={inboxOpen}
          onClick={() => setInboxOpen(!inboxOpen)}
        >
          <Icon name="bell" size={20} />
          <span>알림</span>
          {inboxCount > 0 && <b>{inboxCount}</b>}
        </button>
      </aside>
    );
  }

  return (
    <aside className={`${styles.drawer} sidebar`} aria-label="활동 패널" data-drawer="open">
      <header className={styles.drawerHeader}>
        <div>
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
          {WORKSPACE_TABS.map((tab, index) => (
            <button
              key={tab.key}
              id={`workspace-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls="workspace-tabpanel"
              // 탭 묶음은 Tab 한 번으로 들어오고, 안에서는 화살표로 움직입니다
              tabIndex={activeTab === tab.key ? 0 : -1}
              className={activeTab === tab.key ? styles.activeTab : ''}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {tab.label}
              {tab.key === 'log' && unreadCount > 0 && (
                <b aria-label={`새 기록 ${unreadCount}건`}>{unreadCount}</b>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        id="workspace-tabpanel"
        className={styles.body}
        role={selectedAgentId ? 'region' : 'tabpanel'}
        aria-labelledby={selectedAgentId ? undefined : `workspace-tab-${activeTab}`}
        aria-label={selectedAgentId ? '직원 상세' : undefined}
        data-scroll-root
      >
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
        onSelectBrief={onSelectBrief}
      />
    </aside>
  );
}
