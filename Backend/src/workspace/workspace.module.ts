import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

/**
 * 코드형 산출물 저장소.
 *
 * HTTP 서빙은 컨트롤러가 아니라 `main.ts` 의 정적 미들웨어가 맡습니다.
 * 랜딩페이지 안의 `<link href="style.css">` 같은 상대 경로가 그대로
 * 동작해야 하는데, 컨트롤러 와일드카드로는 그 흉내를 내기 어렵습니다.
 */
@Module({
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
