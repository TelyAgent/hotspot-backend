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

    const strictDecision = value as Partial<EventMergeAgentDecision>;
    if (this.isStrictDecision(strictDecision)) {
      return strictDecision;
    }

    const normalizedDecision = this.normalizeLegacyDecision(value as JsonObject);
    if (normalizedDecision) {
      return normalizedDecision;
    }

    throw new DomainError(
      'Event merge agent decision missing required fields.',
      'EVENT_MERGE_DECISION_INVALID',
    );
  }

  private isStrictDecision(
    decision: Partial<EventMergeAgentDecision>,
  ): decision is EventMergeAgentDecision {
    return (
      decision.decision === 'auto_merge' ||
      decision.decision === 'keep_independent' ||
      decision.decision === 'create_related_event'
    ) &&
      typeof decision.mergeConfidence === 'number' &&
      typeof decision.hardConflict === 'boolean' &&
      Array.isArray(decision.dimensionResults) &&
      Array.isArray(decision.conflictPoints) &&
      Array.isArray(decision.evidenceRefs) &&
      this.isImpact(decision.impact);
  }

  private normalizeLegacyDecision(
    value: JsonObject,
  ): EventMergeAgentDecision | null {
    const legacyDecision = this.extractLegacyDecision(value);
    if (!legacyDecision) {
      return null;
    }

    const dimensionResults =
      this.normalizeDimensionResults(value, legacyDecision.decision);
    const evidenceRefs = this.normalizeStringArray(value.evidenceRefs);
    const conflictPoints = this.normalizeStringArray(value.conflictPoints);
    const impact = this.normalizeImpact(value.impact, legacyDecision.decision);
    const relationSuggestion = this.normalizeRelationSuggestion(
      value.relationSuggestion,
      legacyDecision.decision,
      legacyDecision.reason,
    );

    return {
      decision: legacyDecision.decision,
      mergeConfidence: legacyDecision.mergeConfidence,
      hardConflict: legacyDecision.hardConflict,
      dimensionResults,
      conflictPoints,
      relationSuggestion,
      impact,
      evidenceRefs,
    };
  }

  private extractLegacyDecision(value: JsonObject): {
    decision: EventMergeAgentDecision['decision'];
    mergeConfidence: number;
    hardConflict: boolean;
    reason: string;
  } | null {
    const reason = this.extractReason(value);
    const isSameEvent = this.extractBoolean(value.isSameEvent);
    const mergeDecision = this.extractString(value.mergeDecision);
    const merge = this.isJsonObject(value.merge) ? value.merge : null;
    const isSimilar = merge ? this.extractBoolean(merge.isSimilar) : undefined;

    if (
      isSameEvent === undefined &&
      isSimilar === undefined &&
      mergeDecision === undefined
    ) {
      return null;
    }

    if (
      isSameEvent === true ||
      isSimilar === true ||
      mergeDecision === 'merge' ||
      mergeDecision === 'same' ||
      mergeDecision === 'auto_merge'
    ) {
      return {
        decision: 'auto_merge',
        mergeConfidence: this.extractNumber(value.mergeConfidence, 0.96),
        hardConflict: this.extractBoolean(value.hardConflict) ?? false,
        reason,
      };
    }

    if (
      mergeDecision === 'related' ||
      mergeDecision === 'create_related_event'
    ) {
      return {
        decision: 'create_related_event',
        mergeConfidence: this.extractNumber(value.mergeConfidence, 0.82),
        hardConflict: this.extractBoolean(value.hardConflict) ?? false,
        reason,
      };
    }

    return {
      decision: 'keep_independent',
      mergeConfidence: this.extractNumber(value.mergeConfidence, 0.04),
      hardConflict: this.extractBoolean(value.hardConflict) ?? false,
      reason,
    };
  }

  private normalizeDimensionResults(
    value: JsonObject,
    decision: EventMergeAgentDecision['decision'],
  ): EventMergeAgentDecision['dimensionResults'] {
    if (Array.isArray(value.dimensionResults)) {
      return value.dimensionResults
        .map((item) => this.normalizeDimensionResult(item))
        .filter(
          (
            item,
          ): item is EventMergeAgentDecision['dimensionResults'][number] =>
            item !== null,
        );
    }

    const comparison = this.extractReason(value);
    return [
      {
        dimension: 'core_fact',
        label: '综合事实',
        score: decision === 'auto_merge' ? 0.96 : 0.04,
        result: decision === 'auto_merge' ? 'compatible' : 'conflict',
        comparison: comparison || '模型返回的是旧格式决策，已按兼容规则降级处理。',
        evidenceRefs: this.normalizeStringArray(value.evidenceRefs),
      },
    ];
  }

  private normalizeDimensionResult(
    value: unknown,
  ): EventMergeAgentDecision['dimensionResults'][number] | null {
    if (!this.isJsonObject(value)) {
      return null;
    }

    if (
      !this.isString(value.dimension) ||
      !this.isString(value.label) ||
      typeof value.score !== 'number' ||
      (value.result !== 'compatible' &&
        value.result !== 'conflict' &&
        value.result !== 'uncertain') ||
      !this.isString(value.comparison)
    ) {
      return null;
    }

    return {
      dimension: value.dimension as EventMergeAgentDecision['dimensionResults'][number]['dimension'],
      label: value.label,
      score: value.score,
      result: value.result,
      comparison: value.comparison,
      evidenceRefs: this.normalizeStringArray(value.evidenceRefs),
    };
  }

  private normalizeImpact(
    value: unknown,
    decision: EventMergeAgentDecision['decision'],
  ): EventMergeAgentDecision['impact'] {
    if (this.isImpact(value)) {
      return value;
    }

    const responseAction =
      decision === 'auto_merge'
        ? 'route_once'
        : decision === 'create_related_event'
          ? 'update_context_only'
          : 'route_independently';

    return {
      responseAction,
      reason:
        decision === 'auto_merge'
          ? '旧格式结果已兼容为自动合并。'
          : decision === 'create_related_event'
            ? '旧格式结果已兼容为创建关联事件。'
            : '旧格式结果已兼容为独立保留。',
    };
  }

  private normalizeRelationSuggestion(
    value: unknown,
    decision: EventMergeAgentDecision['decision'],
    reason: string,
  ): EventMergeAgentDecision['relationSuggestion'] | undefined {
    if (decision !== 'create_related_event') {
      return undefined;
    }

    if (this.isJsonObject(value) && this.isString(value.relationType)) {
      const relationType = value.relationType as NonNullable<
        EventMergeAgentDecision['relationSuggestion']
      >['relationType'];
      return {
        relationType,
        reason: this.extractString(value.reason) ?? reason ?? '旧格式结果已兼容。',
      };
    }

    return {
      relationType: 'follow_up',
      reason: reason || '旧格式结果已兼容为关联事件。',
    };
  }

  private isImpact(value: unknown): value is EventMergeAgentDecision['impact'] {
    return (
      this.isJsonObject(value) &&
      (value.responseAction === 'route_once' ||
        value.responseAction === 'route_independently' ||
        value.responseAction === 'update_context_only' ||
        value.responseAction === 'freeze_candidates' ||
        value.responseAction === 'review_published') &&
      this.isString(value.reason)
    );
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private extractReason(value: JsonObject): string {
    if (this.isString(value.reason)) {
      return value.reason;
    }

    if (this.isJsonObject(value.merge) && this.isString(value.merge.reason)) {
      return value.merge.reason;
    }

    return '';
  }

  private extractBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private extractNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private extractString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
