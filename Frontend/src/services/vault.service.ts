import type { VaultNoteResponse, VaultProjectsResponse } from '@shared';
import { http } from './http.client';

/** Obsidian 볼트 조회 API */
export const vaultService = {
  listProjects: (): Promise<VaultProjectsResponse> => http.get('/vault/projects'),

  readNote: (path: string): Promise<VaultNoteResponse> =>
    http.get(`/vault/notes?path=${encodeURIComponent(path)}`),
};
