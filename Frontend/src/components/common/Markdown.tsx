import { useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import styles from './Markdown.module.css';

interface MarkdownProps {
  content: string;
}

/**
 * 마크다운 렌더러.
 *
 * `renderMarkdown` 이 모든 사용자 입력을 escape 한 뒤 허용된 태그만 조립하므로
 * dangerouslySetInnerHTML 을 쓰더라도 스크립트가 주입될 수 없습니다.
 */
export function Markdown({ content }: MarkdownProps): React.JSX.Element {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
