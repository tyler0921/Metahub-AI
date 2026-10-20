import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { LlmModelOption, LlmModelsResponse } from '@shared';
import { Icon } from '@/components/common/Icon';
import { companyService } from '@/services/company.service';
import { ApiError } from '@/services/http.client';
import { useSessionStore } from '@/store/session.store';
import styles from './ModelPicker.module.css';

/** 드롭다운 묶음 이름 — 처음 보는 사람도 어디서 도는 모델인지 알 수 있게 */
const PROVIDER_LABELS: Record<string, string> = {
  ollama: '내 PC (Ollama · 무료)',
  gemini: 'Google Gemini',
  groq: 'Groq',
  claude: 'Claude (API 요금 발생)',
  mock: '체험 모드',
};

const keyOf = (option: LlmModelOption): string => `${option.provider}::${option.model}`;

const labelOf = (option: LlmModelOption): string =>
  option.provider === 'mock' ? '체험 모드 (예시 답변)' : option.model;

/**
 * 공간 메뉴의 AI 모델 고르기 — 버튼을 누르면 메뉴 위로 목록이 펼쳐집니다.
 *
 * OS 기본 <select> 는 펼친 목록을 시스템이 흰 메뉴로 그려 HUD 와 따로 놀아서
 * listbox 패턴으로 직접 그립니다 (↑↓ 이동, Enter 선택, Esc 닫기, 바깥 클릭 닫기).
 *
 * 업무가 진행 중이면 잠급니다 — 도중에 바꾸면 부서마다 다른 모델이 쓴 원고가 섞입니다.
 * 목록은 펼칠 때마다 다시 받아서 방금 받은 Ollama 모델도 바로 보이게 합니다.
 */
export function ModelPicker(): React.JSX.Element | null {
  const isRunning = useSessionStore((s) => s.isRunning);
  const [data, setData] = useState<LlmModelsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** 키보드로 가리키고 있는 항목 */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const refresh = useCallback(async () => {
    try {
      setData(await companyService.getLlmModels());
    } catch {
      // 목록을 못 받아도 지금 모델 표시는 그대로 둡니다
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, isRunning]);

  const locked = isRunning || Boolean(data?.locked);

  // 업무가 시작돼 잠기면 열려 있던 목록도 닫습니다
  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  // 바깥을 누르면 닫습니다
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // 열리면 목록으로 포커스를 옮겨 바로 화살표로 고를 수 있게 합니다
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // 가리키는 항목이 목록 밖이면 보이게 굴립니다
  useEffect(() => {
    if (!open || !activeKey) return;
    listRef.current
      ?.querySelector(`[data-key="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeKey]);

  if (!data) return null;

  const currentKey = keyOf(data.current);
  const groups = [...new Set(data.options.map((option) => option.provider))];
  // 화면에 보이는 순서(묶음 순) 그대로 — 화살표 이동이 눈에 보이는 순서를 따르게
  const ordered = groups.flatMap((provider) =>
    data.options.filter((option) => option.provider === provider),
  );

  const openList = (): void => {
    if (locked || busy) return;
    void refresh();
    setActiveKey(currentKey);
    setOpen(true);
  };

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const select = async (key: string): Promise<void> => {
    close();
    if (key === currentKey) return;
    const next = data.options.find((option) => keyOf(option) === key);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setData(await companyService.selectLlmModel(next));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '모델을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const moveActive = (step: number | 'first' | 'last'): void => {
    if (ordered.length === 0) return;
    const index = ordered.findIndex((option) => keyOf(option) === activeKey);
    const nextIndex =
      step === 'first'
        ? 0
        : step === 'last'
          ? ordered.length - 1
          : (index + step + ordered.length) % ordered.length;
    setActiveKey(keyOf(ordered[nextIndex]));
  };

  const onButtonKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveActive('first');
        break;
      case 'End':
        event.preventDefault();
        moveActive('last');
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (activeKey) void select(activeKey);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const hint = locked ? '진행 중인 업무가 끝나면 바꿀 수 있습니다' : '다음 업무부터 이 모델이 일합니다';

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`AI 모델: ${labelOf(data.current)}. ${hint}`}
        title={hint}
        disabled={locked || busy}
        data-open={open}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKeyDown}
      >
        <span className={styles.text}>
          <span className={styles.label}>{busy ? '바꾸는 중…' : 'AI 모델'}</span>
          <span className={styles.value}>{labelOf(data.current)}</span>
        </span>
        <Icon name={locked ? 'lock' : 'chevronDown'} size={15} className={styles.chevron} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          className={styles.menu}
          role="listbox"
          aria-label="AI 모델 고르기"
          aria-activedescendant={activeKey ? `${listId}-${activeKey}` : undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {groups.map((provider) => (
            <li key={provider} role="presentation">
              <span className={styles.groupLabel} aria-hidden="true">
                {PROVIDER_LABELS[provider] ?? provider}
              </span>
              <ul role="group" aria-label={PROVIDER_LABELS[provider] ?? provider} className={styles.group}>
                {data.options
                  .filter((option) => option.provider === provider)
                  .map((option) => {
                    const key = keyOf(option);
                    return (
                      <li
                        key={key}
                        id={`${listId}-${key}`}
                        data-key={key}
                        role="option"
                        aria-selected={key === currentKey}
                        data-active={key === activeKey}
                        className={styles.option}
                        onPointerEnter={() => setActiveKey(key)}
                        onClick={() => void select(key)}
                      >
                        <span>{labelOf(option)}</span>
                        {key === currentKey && <Icon name="check" size={15} className={styles.check} />}
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
