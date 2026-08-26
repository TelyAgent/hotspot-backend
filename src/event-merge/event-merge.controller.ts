import { Controller, Get, Param } from '@nestjs/common';
import { EventMergeRepository } from './event-merge.repository';
import { EventMergeDetailDto } from './event-merge.types';

@Controller('events')
export class EventMergeController {
  constructor(private readonly repository: EventMergeRepository) {}

  @Get(':eventId/merge-detail')
  async getMergeDetail(
    @Param('eventId') eventId: string,
  ): Promise<EventMergeDetailDto> {
    const [sourceContexts, latestDecision, relations] = await Promise.all([
      this.repository.listSourceContexts(eventId),
      this.repository.getLatestMergeDecision(eventId),
      this.repository.listRelations(eventId),
    ]);

    return {
      eventId,
      contextVersion: latestDecision ? Math.max(1, sourceContexts.length) : 1,
      sourceContexts,
      latestIdentityDecision: latestDecision
        ? {
            mergeConfidence: latestDecision.mergeConfidence,
            decision: latestDecision.decision,
            dimensionResults: latestDecision.dimensionResults,
            conflictPoints: latestDecision.conflictPoints,
            systemAction: systemActionName(latestDecision.decision),
            reason: latestDecision.impact.reason,
          }
        : undefined,
      relations,
    };
  }
}

function systemActionName(decision: string) {
  const names: Record<string, string> = {
    auto_merge: '自动合并',
    keep_independent: '保持独立',
    create_related_event: '创建关联事件',
  };
  return names[decision] ?? decision;
}
