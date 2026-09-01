import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AmbientChatService } from './ambient-chat.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [AgentsController],
  providers: [AgentsService, AmbientChatService],
  exports: [AgentsService],
})
export class AgentsModule {}
