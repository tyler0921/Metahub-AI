import { API_BASE_URL } from '@/config/env';

/** 서버가 내려주는 오류 본문 (AllExceptionsFilter 형식) */
interface ApiErrorBody {
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly path?: string,
    /** 서버가 우리 형식(AllExceptionsFilter)으로 응답했는가 */
    readonly fromBackend = true,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 백엔드가 아예 안 떠 있는 경우 */
  get isNetworkFailure(): boolean {
    return this.status === 0;
  }

  /**
   * 백엔드가 아직 안 떴다고 볼 수 있는가.
   *
   * 개발 중에는 Vite 프록시가 사이에 끼기 때문에, 백엔드가 죽어 있어도
   * 브라우저는 연결 실패가 아니라 **프록시가 만든 HTTP 500** 을 받습니다.
   * 그래서 status 0 만 보면 놓칩니다. 우리 백엔드는 오류도 항상 정해진
   * JSON 형식으로 주므로, "그 형식이 아닌 5xx" 는 백엔드가 아니라
   * 중간 단계가 만든 응답이라고 판단합니다.
   */
  get isServerUnreachable(): boolean {
    return this.isNetworkFailure || (!this.fromBackend && this.status >= 500);
  }
}

/**
 * 얇은 HTTP 클라이언트.
 * 상위 서비스들은 URL 조립·오류 변환을 신경 쓰지 않습니다.
 */
class HttpClient {
  constructor(private readonly baseUrl: string) {}

  resolve(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...init });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const createInit = (): RequestInit => {
      const headers = new Headers({ 'content-type': 'application/json' });
      const token = this.readAdminToken();
      if (token) headers.set('authorization', `Bearer ${token}`);
      return {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      };
    };

    try {
      return await this.request<T>(path, createInit());
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const token = window.prompt(
        '관리자 작업입니다. Backend/.env에 설정한 ADMIN_TOKEN을 입력하세요.',
      );
      if (!token?.trim()) throw error;
      window.localStorage.setItem('metahub.adminToken', token.trim());
      return this.request<T>(path, createInit());
    }
  }

  private readAdminToken(): string {
    try {
      return window.localStorage.getItem('metahub.adminToken')?.trim() ?? '';
    } catch {
      return '';
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.resolve(path), init);
    } catch (cause) {
      throw new ApiError(
        0,
        '백엔드 서버에 연결할 수 없습니다.',
        path,
        false,
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      // message 가 있어야 우리 백엔드가 만든 오류입니다 (프록시 오류 페이지와 구분)
      const fromBackend = typeof body?.message === 'string';
      throw new ApiError(
        response.status,
        fromBackend
          ? body.message
          : `요청이 실패했습니다 (HTTP ${response.status})`,
        path,
        fromBackend,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

export const http = new HttpClient(`${API_BASE_URL}/api`);
