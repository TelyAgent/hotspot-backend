import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { parseTake } from '../common/utils/request.util';
import { AssignmentRepository } from './assignment.repository';
import { AssignmentAgentService } from './decision/assignment-agent.service';

@Controller('assignments')
export class AssignmentController {
  constructor(
    private readonly assignmentRepository: AssignmentRepository,
    private readonly assignmentAgentService: AssignmentAgentService,
  ) {}

  @Get('runs')
  listRuns(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('take') take?: string,
  ) {
    return this.assignmentRepository.listRuns({
      targetType,
      targetId,
      take: parseTake(take),
    });
  }

  @Get('items')
  listItems(
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    return this.assignmentRepository.listItems({
      targetType,
      targetId,
      status,
      take: parseTake(take),
    });
  }

  @Post('run')
  run(@Body() body: Record<string, unknown>) {
    return this.assignmentAgentService.assign({
      targetType: String(body.targetType ?? 'opportunity') as never,
      targetId: String(body.targetId),
      targetContext:
        typeof body.targetContext === 'object' && body.targetContext !== null
          ? (body.targetContext as JsonObject)
          : {},
      topics: Array.isArray(body.topics) ? body.topics.map(String) : [],
      platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : [],
    });
  }

  @Post('items/:id/confirm')
  confirmItem(@Param('id') id: string) {
    return this.assignmentRepository.confirmItem(id);
  }
}
