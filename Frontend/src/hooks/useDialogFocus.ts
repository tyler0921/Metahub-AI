import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogFocusOptions {
  /** 열려 있는지 — false 가 되는 순간 열기 전 포커스로 되돌립니다 */
  readonly active: boolean;
  /** Esc 로 닫기 */
  readonly onClose: () => void;
  /**
   * Tab 을 안에 가둘지. 화면 전체를 덮는 모달(aria-modal)만 가둡니다 —
   * 팝오버까지 가두면 바깥 컨트롤로 빠져나갈 길이 없어집니다.
   */
  readonly trap?: boolean;
  /** 처음 포커스를 줄 요소. 없으면 안쪽 첫 번째 포커스 가능 요소 */
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * 대화상자·팝오버의 키보드 동선.
 *
 * 열리면 안으로 포커스를 옮기고, Esc 로 닫고, 닫히면 열었던 버튼으로 돌아갑니다.
 * 이게 없으면 키보드 사용자는 열린 창을 찾아 Tab 을 수십 번 눌러야 하고,
 * 닫은 뒤에는 포커스가 문서 맨 앞으로 튀어 어디 있었는지 잃어버립니다.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  { active, onClose, trap = false, initialFocus }: DialogFocusOptions,
): void {
  // 매 렌더 새 함수가 와도 리스너를 다시 달지 않도록 최신 값만 붙잡아 둡니다
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initialFocus?.current ?? container.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container).focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!trap || event.key !== 'Tab') return;

      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null || item === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      } else if (!container.contains(document.activeElement)) {
        event.preventDefault();
        head.focus();
      }
    };

    // 캡처 단계에서 받아야 오피스의 전역 Esc·이동 키보다 먼저 처리됩니다
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [active, containerRef, initialFocus, trap]);
}
