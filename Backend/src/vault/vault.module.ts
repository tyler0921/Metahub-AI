import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { VaultEmbeddingStore } from './embedding/vault-embedding.store';
import { NoteFormatter } from './formatters/note.formatter';
import { VaultRepository } from './repositories/vault.repository';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  imports: [AgentsModule],
  controllers: [VaultController],
  providers: [VaultRepository, NoteFormatter, VaultEmbeddingStore, VaultService],
  exports: [VaultService],
})
export class VaultModule {}
