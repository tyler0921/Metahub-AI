import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { LlmModelsResponse } from '@shared';
import { AdminMutationGuard } from '../common/guards/admin-mutation.guard';
import { LlmModelRegistry, LlmSelectionError } from '../llm/llm-model.registry';
import { SelectLlmModelDto } from './dto/select-llm-model.dto';
import { SessionRepository } from './repositories/session.repository';

/**
 * 화면의 모델 드롭다운.
 *
 * 업무 도중에 모델이 바뀌면 부서마다 다른 모델이 쓴 원고가 섞입니다.
 * 그래서 진행 중인 업무가 있으면 바꾸지 못하게 막습니다.
 */
@Controller('llm')
@UseGuards(AdminMutationGuard)
export class LlmModelController {
  constructor(
    private readonly models: LlmModelRegistry,
    private readonly sessions: SessionRepository,
  ) {}

  @Get('models')
  async list(): Promise<LlmModelsResponse> {
    const { provider, model } = this.models.config;
    return {
      current: { provider, model },
      options: await this.models.listOptions(),
      locked: this.sessions.findActive() !== null,
    };
  }

  @Post('model')
  async select(@Body() dto: SelectLlmModelDto): Promise<LlmModelsResponse> {
    if (this.sessions.findActive()) {
      throw new ConflictException('진행 중인 업무가 끝난 뒤에 모델을 바꿀 수 있습니다.');
    }
    try {
      await this.models.select(dto.provider, dto.model);
    } catch (error) {
      if (error instanceof LlmSelectionError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.list();
  }
}
