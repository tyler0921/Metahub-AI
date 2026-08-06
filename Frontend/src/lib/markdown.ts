/**
 * 아주 작은 마크다운 → HTML 변환기.
 * 제목·표·목록·인용·굵게·인라인 코드만 지원합니다.
 * (산출물 렌더링 용도로만 쓰므로 외부 라이브러리를 들이지 않았습니다)
 */

export function escapeHtml(text: string): string {
  return String(text).replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch,
  );
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g, '<code>$1</code>');
}

/** 로그 미리보기용 — 마크다운 기호만 제거한 평문 */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

type ListKind = 'ul' | 'ol' | null;

export function renderMarkdown(markdown: string): string {
  const lines = String(markdown).split('\n');
  const out: string[] = [];

  let inTable = false;
  let listKind: ListKind = null;

  const closeBlocks = (): void => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
    if (listKind) {
      out.push(`</${listKind}>`);
      listKind = null;
    }
  };

  for (const line of lines) {
    // 표
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:-]+$/.test(line)) continue; // 구분선
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      if (!inTable) {
        closeBlocks();
        inTable = true;
        out.push(
          `<table><thead><tr>${cells.map((c) => `<th>${renderInline(c)}</th>`).join('')}</tr></thead><tbody>`,
        );
      } else {
        out.push(`<tr>${cells.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeBlocks();
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (listKind !== 'ul') {
        closeBlocks();
        out.push('<ul>');
        listKind = 'ul';
      }
      out.push(`<li>${renderInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (listKind !== 'ol') {
        closeBlocks();
        out.push('<ol>');
        listKind = 'ol';
      }
      out.push(`<li>${renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeBlocks();
      out.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeBlocks();
      out.push('<hr>');
      continue;
    }

    if (!line.trim()) {
      closeBlocks();
      continue;
    }

    closeBlocks();
    out.push(`<p>${renderInline(line)}</p>`);
  }

  closeBlocks();
  return out.join('');
}
