import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { NoteFormatter } from './formatters/note.formatter';
import { VaultRepository } from './repositories/vault.repository';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';

@Module({
  imports: [AgentsModule],
  controllers: [VaultController],
  providers: [VaultRepository, NoteFormatter, VaultService],
  exports: [VaultService],
})
export class VaultModule {}
