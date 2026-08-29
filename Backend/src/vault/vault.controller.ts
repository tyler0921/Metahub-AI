import { Controller, Get, Query } from '@nestjs/common';
import type { VaultNoteResponse, VaultProjectsResponse } from '@shared';
import { ReadNoteQueryDto } from './dto/read-note.query.dto';
import { VaultService } from './vault.service';

@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('projects')
  listProjects(): Promise<VaultProjectsResponse> {
    return this.vault.listProjects();
  }

  @Get('notes')
  async readNote(@Query() query: ReadNoteQueryDto): Promise<VaultNoteResponse> {
    return {
      path: query.path,
      content: await this.vault.readNote(query.path),
    };
  }
}
