import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebSearchConfig } from '../config/configuration';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const RESULT_ANCHOR =
  /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_ANCHOR = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  '#x27': "'",
  nbsp: ' ',
};

function codePointFromEntity(raw: string, radix: number): string | null {
  const point = Number.parseInt(raw, radix);
  if (!Number.isInteger(point) || point < 0 || point > 0x10_ffff) return null;
  return String.fromCodePoint(point);
}

function decodeEntities(text: string): string {
  return text.replace(/&([a-zA-Z]+|#x?[0-9a-fA-F]+);/g, (match, code: string) => {
    if (ENTITIES[code]) return ENTITIES[code];
    if (code.startsWith('#x')) return codePointFromEntity(code.slice(2), 16) ?? match;
    if (code.startsWith('#')) return codePointFromEntity(code.slice(1), 10) ?? match;
    return match;
  });
}

/** 닫히지 않은 태그는 그대로 남기고, 닫힌 태그만 선형 시간에 걷어냅니다 */
function stripTags(html: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) {
      result += html.slice(cursor);
      break;
    }
    result += html.slice(cursor, open);
    const close = html.indexOf('>', open + 1);
    if (close === -1) {
      result += html.slice(open);
      break;
    }
    cursor = close + 1;
  }
  return decodeEntities(result).trim();
}

/** DuckDuckGo 는 실제 URL 을 `//duckduckgo.com/l/?uddg=<encoded>&...` 로 감싸서 줍니다 */
function unwrapDuckDuckGoUrl(href: string): string {
  const match = /[?&]uddg=([^&]+)/.exec(href);
  if (!match) return href.startsWith('//') ? `https:${href}` : href;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return href;
  }
}

/**
 * 리서치팀 전용 웹 검색.
 *
 * API 키가 필요 없는 DuckDuckGo HTML 엔드포인트를 씁니다 — 이 앱은 로컬(Ollama)
 * 우선이라, 검색까지 키를 요구하면 "키 없이 바로 되는" 설치 경험이 깨집니다.
 * 대신 공식 API 가 아니라 마크업 파싱이라 언제든 깨질 수 있습니다 — 그래서
 * 절대 던지지 않고 빈 배열을 돌려줍니다. 호출부는 이 경우 검색 없이(지금까지의
 * 동작대로) 계속 진행합니다.
 */
@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly config: WebSearchConfig;
  private warnedOnce = false;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<WebSearchConfig>('webSearch');
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  async search(query: string): Promise<WebSearchResult[]> {
    const trimmed = query.trim();
    if (!this.config.enabled || !trimmed) return [];

    try {
      const response = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          // 기본 UA 로 요청하면 종종 차단됩니다
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
        body: new URLSearchParams({ q: trimmed, kl: 'kr-kr' }).toString(),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        this.warnOnce(`DuckDuckGo 검색 ${response.status} — 검색 없이 진행합니다.`);
        return [];
      }

      const html = await response.text();
      return this.parseResults(html).slice(0, this.config.resultLimit);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.warnOnce(`웹 검색에 실패했습니다 — 검색 없이 진행합니다. 원인: ${message}`);
      return [];
    }
  }

  private parseResults(html: string): WebSearchResult[] {
    const titles: Array<{ url: string; title: string }> = [];
    for (const match of html.matchAll(RESULT_ANCHOR)) {
      const url = unwrapDuckDuckGoUrl(match[1]);
      const title = stripTags(match[2]);
      if (url && title) titles.push({ url, title });
    }

    const snippets = [...html.matchAll(SNIPPET_ANCHOR)].map((match) => stripTags(match[1]));

    return titles.map((entry, index) => ({
      title: entry.title,
      url: entry.url,
      snippet: snippets[index] ?? '',
    }));
  }

  private warnOnce(message: string): void {
    if (this.warnedOnce) return;
    this.warnedOnce = true;
    this.logger.warn(message);
  }
}
