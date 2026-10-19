import { create } from 'zustand';

/** 활동 패널의 탭 */
export type WorkspaceTabKey = 'tasks' | 'log' | 'result' | 'vault';

/** 상단 탭·하단 메뉴·우측 레일이 모두 같은 이름을 씁니다 */
export const WORKSPACE_TABS: ReadonlyArray<{ key: WorkspaceTabKey; label: string }> = [
  { key: 'tasks', label: '업무' },
  { key: 'log', label: '진행' },
  { key: 'result', label: '산출물' },
  { key: 'vault', label: '문서' },
];

/**
 * HUD 끼리 주고받는 화면 상태.
 *
 * 상단 탭(ProjectStatusBar), 하단 메뉴(OfficeCanvas), 우측 레일(WorkspaceSidebar)이
 * 서로 다른 트리에 있어서, 패널을 여는 요청과 지금 열린 탭을 여기서 나눕니다.
 * 세션 데이터와 섞지 않으려고 session.store 와 분리했습니다.
 */
interface UiState {
  /**
   * 패널을 열어 달라는 요청. id 가 바뀔 때마다 한 번 처리됩니다.
   * 'office' 는 패널을 닫고 오피스 전체를 다시 보여 달라는 뜻입니다.
   */
  panelRequest: { tab: WorkspaceTabKey | 'office'; id: number };
  /** 지금 열린 패널 탭 — 닫혀 있으면 null */
  openPanel: WorkspaceTabKey | null;
  inboxOpen: boolean;
  /** 업무함에 쌓인 대기·승인 건수 — 레일 배지에 씁니다 */
  inboxCount: number;

  requestPanel: (tab: WorkspaceTabKey | 'office') => void;
  setOpenPanel: (tab: WorkspaceTabKey | null) => void;
  setInboxOpen: (open: boolean) => void;
  setInboxCount: (count: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  panelRequest: { tab: 'log', id: 0 },
  openPanel: null,
  inboxOpen: false,
  inboxCount: 0,

  requestPanel: (tab) =>
    set((state) => ({ panelRequest: { tab, id: state.panelRequest.id + 1 } })),
  setOpenPanel: (tab) => set({ openPanel: tab }),
  setInboxOpen: (open) => set({ inboxOpen: open }),
  setInboxCount: (count) => set({ inboxCount: count }),
}));
