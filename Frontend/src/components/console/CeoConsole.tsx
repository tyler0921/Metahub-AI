import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BRIEF_SAMPLES } from '@/constants/samples';
import styles from './CeoConsole.module.css';

interface CeoConsoleProps {
  isRunning: boolean;
  isCancelling: boolean;
  disabled: boolean;
  presetBrief?: string;
  followUpFrom?: string | null;
  /**
   * 값이 바뀌면 콘솔을 펼치고 커서를 놓습니다.
   * 오피스의 대표 집무실·로비에서 이 신호를 보냅니다.
   */
  focusRequestId?: number;
  onPresetConsumed?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onCancelFollowUp?: () => void;
  onCancel: () => void;
  onSubmit: (brief: string) => void;
}

const CHIP_LABELS = ['시장 조사', '기술 검토', '가격 대응', '신규 사업'] as const;

export function CeoConsole({
  isRunning,
  isCancelling,
  disabled,
  presetBrief,
  followUpFrom,
  focusRequestId = 0,
  onPresetConsumed,
  onCollapsedChange,
  onCancelFollowUp,
  onCancel,
  onSubmit,
}: CeoConsoleProps): React.JSX.Element {
  const [brief, setBrief] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onCollapsedChange?.(!expanded);
  }, [expanded, onCollapsedChange]);

  useEffect(() => {
    if (!followUpFrom) return;
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [followUpFrom]);

  useEffect(() => {
    if (focusRequestId === 0) return;
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [focusRequestId]);

  useEffect(() => {
    if (!presetBrief) return;
    setBrief(presetBrief);
    setExpanded(true);
    onPresetConsumed?.();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [presetBrief, onPresetConsumed]);

  const submit = (): void => {
    const trimmed = brief.trim();
    if (!trimmed || isRunning || disabled) return;
    onSubmit(trimmed);
    setBrief('');
    setExpanded(false);
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className={`${styles.console} ${expanded ? styles.expanded : ''}`} onSubmit={handleSubmit}>
      {followUpFrom && expanded && (
        <div className={styles.followUpNotice}>
          <span><b>이어서 지시</b> 직전 산출물을 기준으로 수정합니다.</span>
          <button type="button" onClick={onCancelFollowUp}>새 업무로 전환</button>
        </div>
      )}

      <div className={styles.inputRow}>
        <button
          type="button"
          className={styles.expandBtn}
          aria-label={expanded ? '빠른 지시 닫기' : '빠른 지시 열기'}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>

        <span className={styles.commandIcon}>대표 지시</span>

        <textarea
          ref={inputRef}
          id="brief"
          className={styles.input}
          rows={expanded ? 3 : 1}
          value={brief}
          disabled={disabled}
          placeholder={
            followUpFrom
              ? '어디를 어떻게 수정할까요?'
              : 'AI 팀에 업무를 지시하세요…'
          }
          onFocus={() => setExpanded(true)}
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        {isRunning ? (
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={isCancelling}
            onClick={onCancel}
          >
            {isCancelling ? '중단 중…' : '중단'}
          </button>
        ) : (
          <button
            type="submit"
            className={styles.submit}
            disabled={disabled || !brief.trim()}
          >
            전달
          </button>
        )}
      </div>

      {expanded && (
        <div className={styles.quickRow}>
          <span className={styles.quickLabel}>빠른 지시</span>
          <div className={styles.chips}>
            {BRIEF_SAMPLES.map((sample, index) => (
              <button
                key={sample}
                type="button"
                className={styles.chip}
                disabled={disabled || isRunning}
                onClick={() => setBrief(sample)}
              >
                {CHIP_LABELS[index] ?? sample.slice(0, 8)}
              </button>
            ))}
          </div>
          <span className={styles.keyboardHint}>Enter 전송 · Shift+Enter 줄바꿈</span>
        </div>
      )}
    </form>
  );
}
