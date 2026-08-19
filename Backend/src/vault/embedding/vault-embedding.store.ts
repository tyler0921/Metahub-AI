import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { VaultConfig } from '../../config/configuration';
import type { VaultNoteEntity } from '../entities/vault-note.entity';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider';

/** 한 번의 회상에서 새로 임베딩할 노트 상한 — Ollama 는 직렬 처리라 대량 백필이 회상을 지연시킵니다 */
const MAX_EMBED_PER_RECALL = 20;

interface CacheEntry {
  mtimeMs: number;
  vector: number[];
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 코사인 유사도(-1~1)를 회상 점수에 바로 섞을 수 있게 0~1 로 정규화 */
export function normalizeCosine(cos: number): number {
  return (cos + 1) / 2;
}

/**
 * 노트 임베딩 캐시 + 유사도 조회.
 *
 * `VaultRepository.loadAllNotes()`의 mtime 캐시와 같은 사상 — mtime 이 바뀐 노트만
 * 다시 임베딩합니다. 다른 점은 이 캐시는 디스크에 영속화된다는 것(재시작해도 임베딩을
 * 다시 계산하지 않음). `AutonomousStateStore`와 같은 tmp+rename 원자적 쓰기를 씁니다.
 */
@Injectable()
export class VaultEmbeddingStore implements OnModuleInit {
  private readonly logger = new Logger(VaultEmbeddingStore.name);
  private readonly config: VaultConfig;
  private readonly provider: OllamaEmbeddingProvider;
  private cache = new Map<string, CacheEntry>();

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<VaultConfig>('vault');
    this.provider = new OllamaEmbeddingProvider(this.config);
  }

  onModuleInit(): void {
    this.cache = this.load();
  }

  get enabled(): boolean {
    return this.config.embeddingsEnabled;
  }

  /**
   * 쿼리와 각 노트의 코사인 유사도(0~1)를 돌려줍니다.
   *
   * 임베딩이 꺼져 있거나, 쿼리 임베딩 자체가 실패하면 `null` — 호출부는 키워드
   * 전용 회상으로 그대로 되돌아가면 됩니다. 캐시에 없는 노트 중 일부만 새로
   * 계산했다면(상한 초과) 이번 회상 결과에서는 조용히 빠지고 다음 회상에서 채워집니다.
   */
  async similarities(
    query: string,
    notes: VaultNoteEntity[],
    textOf: (note: VaultNoteEntity) => string,
  ): Promise<Map<string, number> | null> {
    if (!this.config.embeddingsEnabled || notes.length === 0) return null;

    const [queryVector] = await this.provider.embed([query]);
    if (!queryVector) return null;

    await this.refreshStale(notes, textOf);

    const result = new Map<string, number>();
    for (const note of notes) {
      const cached = this.cache.get(note.relativePath);
      if (cached && cached.mtimeMs === note.modifiedAt.getTime()) {
        result.set(note.relativePath, normalizeCosine(cosineSimilarity(queryVector, cached.vector)));
      }
    }
    return result;
  }

  private async refreshStale(
    notes: VaultNoteEntity[],
    textOf: (note: VaultNoteEntity) => string,
  ): Promise<void> {
    const stale = notes.filter((note) => {
      const cached = this.cache.get(note.relativePath);
      return !cached || cached.mtimeMs !== note.modifiedAt.getTime();
    });
    if (stale.length === 0) {
      this.prune(notes);
      return;
    }

    const batch = stale.slice(0, MAX_EMBED_PER_RECALL);
    const vectors = await this.provider.embed(batch.map(textOf));

    let changed = false;
    batch.forEach((note, i) => {
      const vector = vectors[i];
      if (!vector) return;
      this.cache.set(note.relativePath, { mtimeMs: note.modifiedAt.getTime(), vector });
      changed = true;
    });

    if (stale.length > batch.length) {
      this.logger.debug(
        `노트 ${stale.length - batch.length}건은 이번 회상에서 임베딩하지 못해 다음으로 미룹니다.`,
      );
    }

    this.prune(notes);
    if (changed) this.save();
  }

  /** 삭제되거나 이동한 노트를 캐시에서 지웁니다 (메모리·디스크가 계속 늘어나지 않도록) */
  private prune(currentNotes: VaultNoteEntity[]): void {
    const keep = new Set(currentNotes.map((n) => n.relativePath));
    for (const key of this.cache.keys()) {
      if (!keep.has(key)) this.cache.delete(key);
    }
  }

  private load(): Map<string, CacheEntry> {
    try {
      const parsed = JSON.parse(readFileSync(this.config.embeddingCachePath, 'utf8')) as Partial<CacheFile>;
      if (parsed.version !== 1 || typeof parsed.entries !== 'object' || !parsed.entries) {
        return new Map();
      }
      return new Map(Object.entries(parsed.entries));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`임베딩 캐시를 읽지 못해 새로 시작합니다: ${String(error)}`);
      }
      return new Map();
    }
  }

  private save(): void {
    const file: CacheFile = { version: 1, entries: Object.fromEntries(this.cache) };
    mkdirSync(dirname(this.config.embeddingCachePath), { recursive: true });
    const tempPath = `${this.config.embeddingCachePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(file), 'utf8');
    renameSync(tempPath, this.config.embeddingCachePath);
  }
}
