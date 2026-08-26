import { Injectable } from '@nestjs/common';
import { EventMergeRepository } from './event-merge.repository';
import { EventMergeAgentService } from './event-merge-agent.service';
import { EventMergeDecision, EventSourceContext } from './event-merge.types';

export type EventMergeProcessAction =
  | 'no_candidate'
  | 'auto_merged'
  | 'kept_independent'
  | 'related_event';

export interface EventMergeProcessResult {
  action: EventMergeProcessAction;
  decision?: EventMergeDecision;
  candidateMainEventId?: string;
}

@Injectable()
export class EventMergeOrchestratorService {
  private readonly autoMergeThreshold = 0.95;

  constructor(
    private readonly repository: EventMergeRepository,
    private readonly agent: EventMergeAgentService,
  ) {}

  async processIncomingContext(
    incomingContext: EventSourceContext,
  ): Promise<EventMergeProcessResult> {
    const candidates = await this.repository.findCandidateMainEvents(incomingContext, {
      take: 5,
    });
    const candidateEvent = candidates[0];

    if (!candidateEvent) {
      return {
        action: 'no_candidate',
      };
    }

    const candidateContexts = await this.repository.listSourceContexts(
      candidateEvent.id,
    );
    const agentResult = await this.agent.compare({
      incomingContext,
      candidateEvent,
      candidateContexts,
    });
    const decision = await this.repository.createMergeDecision({
      incomingContextId: incomingContext.id,
      candidateMainEventId: candidateEvent.id,
      decision: agentResult.decision.decision,
      mergeConfidence: agentResult.decision.mergeConfidence,
      hardConflict: agentResult.decision.hardConflict,
      dimensionResults: agentResult.decision.dimensionResults,
      conflictPoints: agentResult.decision.conflictPoints,
      evidenceRefs: agentResult.decision.evidenceRefs,
      impact: agentResult.decision.impact,
      agentRunId: agentResult.agentRunId,
      decidedBy: 'agent',
    });

    if (this.canAutoMerge(agentResult.decision)) {
      await this.repository.attachSourceContextToMainEvent({
        contextId: incomingContext.id,
        mainEventId: candidateEvent.id,
      });

      if (
        incomingContext.mainEventId &&
        incomingContext.mainEventId !== candidateEvent.id
      ) {
        await this.repository.markEventMergedIntoCanonical({
          eventId: incomingContext.mainEventId,
          canonicalEventId: candidateEvent.id,
        });
      }

      return {
        action: 'auto_merged',
        decision,
        candidateMainEventId: candidateEvent.id,
      };
    }

    if (
      agentResult.decision.decision === 'create_related_event' &&
      agentResult.decision.relationSuggestion &&
      incomingContext.mainEventId
    ) {
      await this.repository.createEventRelation({
        fromEventId: candidateEvent.id,
        toEventId: incomingContext.mainEventId,
        relationType: agentResult.decision.relationSuggestion.relationType,
        reason: agentResult.decision.relationSuggestion.reason,
        evidenceRefs: agentResult.decision.evidenceRefs,
        createdBy: 'agent',
      });

      return {
        action: 'related_event',
        decision,
        candidateMainEventId: candidateEvent.id,
      };
    }

    return {
      action: 'kept_independent',
      decision,
      candidateMainEventId: candidateEvent.id,
    };
  }

  private canAutoMerge(decision: {
    decision: string;
    mergeConfidence: number;
    hardConflict: boolean;
  }) {
    return (
      decision.decision === 'auto_merge' &&
      !decision.hardConflict &&
      decision.mergeConfidence >= this.autoMergeThreshold
    );
  }
}
