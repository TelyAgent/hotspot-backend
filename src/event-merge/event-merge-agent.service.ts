import { Inject, Injectable } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../agent/agent.tokens';
import { AgentWorkflowEngine } from '../agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject } from '../common/types/json.type';
import { Event } from '../opportunity/opportunity.types';
import {
  EventMergeAgentDecision,
  EventSourceContext,
} from './event-merge.types';

@Injectable()
export class EventMergeAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
  ) {}

  async compare(input: {
    incomingContext: EventSourceContext;
    candidateEvent: Event;
    candidateContexts?: EventSourceContext[];
  }): Promise<{ decision: EventMergeAgentDecision; agentRunId: string }> {
    const result = await this.workflowEngine.run({
      agentType: 'event_merge',
      goal: {
        instruction:
          '判断 incoming source event context 与 candidate main event 是否指向同一现实事件，并输出结构化 EventMergeAgentDecision。',
        incomingContext: input.incomingContext as unknown as JsonObject,
        candidateEvent: input.candidateEvent as unknown as JsonObject,
        candidateContexts: (input.candidateContexts ?? []) as unknown as JsonObject[],
        constraints: {
          autoMergeThreshold: 0.95,
          humanReviewThreshold: 0.8,
          hardConflictBlocksAutoMerge: true,
        },
      },
      maxSteps: 4,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Event merge agent failed.',
        'EVENT_MERGE_AGENT_FAILED',
      );
    }

    return {
      decision: this.parseDecision(result.result),
      agentRunId: result.runId,
    };
  }

  private parseDecision(value: unknown): EventMergeAgentDecision {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DomainError(
        'Event merge agent returned invalid decision.',
        'EVENT_MERGE_DECISION_INVALID',
      );
    }

    const decision = value as Partial<EventMergeAgentDecision>;
    if (
      !decision.decision ||
      typeof decision.mergeConfidence !== 'number' ||
      typeof decision.hardConflict !== 'boolean' ||
      !Array.isArray(decision.dimensionResults) ||
      !Array.isArray(decision.conflictPoints) ||
      !Array.isArray(decision.evidenceRefs) ||
      !decision.impact
    ) {
      throw new DomainError(
        'Event merge agent decision missing required fields.',
        'EVENT_MERGE_DECISION_INVALID',
      );
    }

    return decision as EventMergeAgentDecision;
  }
}
