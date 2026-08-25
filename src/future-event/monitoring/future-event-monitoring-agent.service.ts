import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import {
  FutureEvent,
  FutureEventMonitoringDecision,
  FutureEventMonitoringPlan,
} from '../future-event.types';
import { FutureEventRepository } from '../future-event.repository';
import { FutureEventMonitoringPlanService } from './future-event-monitoring-plan.service';

@Injectable()
export class FutureEventMonitoringAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly futureEventRepository: FutureEventRepository,
    private readonly monitoringPlanService: FutureEventMonitoringPlanService,
  ) {}

  async generateForEventId(
    futureEventId: string,
    instruction?: string,
  ): Promise<FutureEventMonitoringPlan> {
    const futureEvent =
      await this.futureEventRepository.findEventById(futureEventId);

    if (!futureEvent) {
      throw new DomainError('Future event not found.', 'FUTURE_EVENT_NOT_FOUND', {
        futureEventId,
      });
    }

    return this.generatePlan({
      futureEvent,
      instruction,
    });
  }

  async generatePlan(input: {
    futureEvent: FutureEvent;
    instruction?: string;
  }): Promise<FutureEventMonitoringPlan> {
    const result = await this.workflowEngine.run({
      agentType: 'future_event_monitoring',
      goal: {
        instruction:
          input.instruction ??
          '为未来事件生成可执行的监控计划，默认需要人工确认。',
        futureEvent: this.serializeFutureEvent(input.futureEvent),
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Future event monitoring agent failed.',
        'FUTURE_EVENT_MONITORING_AGENT_FAILED',
        {
          futureEventId: input.futureEvent.id,
        },
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);

    return this.monitoringPlanService.createDraft({
      futureEventId: input.futureEvent.id,
      monitoringStartAt: new Date(decision.monitoringStartAt),
      monitoringEndAt: new Date(decision.monitoringEndAt),
      phases: decision.phases,
      triggerRules: decision.triggerRules,
      expectedContentAngles: decision.expectedContentAngles,
      evidenceRefs: decision.evidenceRefs,
      confidence: decision.confidence,
      missingData: decision.missingData,
      riskNotes: decision.riskNotes,
    });
  }

  private serializeFutureEvent(futureEvent: FutureEvent): JsonObject {
    return {
      id: futureEvent.id,
      title: futureEvent.title,
      eventType: futureEvent.eventType,
      scheduledAt: futureEvent.scheduledAt?.toISOString() ?? null,
      startAt: futureEvent.startAt?.toISOString() ?? null,
      endAt: futureEvent.endAt?.toISOString() ?? null,
      domains: futureEvent.domains,
      summary: futureEvent.summary ?? null,
      whyItMatters: futureEvent.whyItMatters ?? null,
      confidence: futureEvent.confidence,
    };
  }

  private parseDecision(value: JsonObject): FutureEventMonitoringDecision {
    const required = [
      'monitoringStartAt',
      'monitoringEndAt',
      'phases',
      'triggerRules',
      'expectedContentAngles',
      'evidenceRefs',
      'confidence',
      'missingData',
      'riskNotes',
    ];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Future event monitoring decision missing field: ${key}`,
          'FUTURE_EVENT_MONITORING_DECISION_INVALID',
          {
            field: key,
          },
        );
      }
    }

    return value as unknown as FutureEventMonitoringDecision;
  }
}
