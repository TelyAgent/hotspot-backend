import { Inject, Injectable } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { FutureEventRepository } from '../future-event.repository';
import { CreateFutureEventCandidateInput } from '../future-event.types';

@Injectable()
export class FutureEventDiscoveryAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly futureEventRepository: FutureEventRepository,
  ) {}

  async discover(input: { instruction: string; domains: string[] }) {
    return this.workflowEngine.run({
      agentType: 'future_event_discovery',
      goal: {
        instruction: input.instruction,
        domains: input.domains,
      },
      maxSteps: 5,
    });
  }

  async discoverFromSignals(input: {
    instruction: string;
    signals: Array<{
      id: string;
      title: string;
      summary?: string | null;
      observedAt: Date;
      metadata?: unknown;
    }>;
  }) {
    if (input.signals.length === 0) {
      return {
        runId: null,
        candidateCount: 0,
        candidates: [],
      };
    }

    const result = await this.workflowEngine.run({
      agentType: 'future_event_discovery',
      goal: {
        instruction: input.instruction,
        signals: input.signals.map(serializeSignal),
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Future event discovery agent failed.',
        'FUTURE_EVENT_DISCOVERY_AGENT_FAILED',
      );
    }

    const decision = isRecord(result.result) ? result.result : {};
    const candidateInputs = Array.isArray(decision.candidates)
      ? decision.candidates
          .map(toCandidateInput)
          .filter(isCandidateInput)
      : [];

    const candidates = [];
    for (const candidateInput of candidateInputs) {
      candidates.push(
        await this.futureEventRepository.upsertCandidate(candidateInput),
      );
    }

    return {
      runId: result.runId,
      candidateCount: candidates.length,
      candidates,
    };
  }
}

function serializeSignal(signal: {
  id: string;
  title: string;
  summary?: string | null;
  observedAt: Date;
  metadata?: unknown;
}): JsonObject {
  return {
    id: signal.id,
    title: signal.title,
    summary: signal.summary ?? null,
    observedAt: signal.observedAt.toISOString(),
    metadata: toJsonValue(signal.metadata),
  };
}

function toCandidateInput(
  value: unknown,
): CreateFutureEventCandidateInput | null {
  if (!isRecord(value)) return null;

  const title = getString(value.title);
  const eventType = getString(value.eventType);
  const summary = getString(value.summary);
  const whyItMatters = getString(value.whyItMatters);
  if (!title || !eventType || !summary || !whyItMatters) {
    return null;
  }

  return {
    title,
    eventType,
    scheduledAt: parseDate(value.scheduledAt),
    timeRange: isRecord(value.timeRange) ? (value.timeRange as JsonObject) : null,
    domains: getStringArray(value.domains),
    summary,
    whyItMatters,
    recommendedMonitoringStartAt: parseDate(value.recommendedMonitoringStartAt),
    recommendedMonitoringEndAt: parseDate(value.recommendedMonitoringEndAt),
    suggestedKeywords: getStringArray(value.suggestedKeywords),
    suggestedAccounts: getStringArray(value.suggestedAccounts),
    suggestedPlatforms: getStringArray(value.suggestedPlatforms),
    evidenceRefs: getStringArray(value.evidenceRefs),
    confidence: toConfidence(value.confidence),
    status: 'new' as const,
    missingData: getStringArray(value.missingData),
    riskNotes: getStringArray(value.riskNotes),
  };
}

function isCandidateInput(
  value: ReturnType<typeof toCandidateInput>,
): value is CreateFutureEventCandidateInput {
  return value !== null;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return null;
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'low') return value;
  return 'medium';
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
