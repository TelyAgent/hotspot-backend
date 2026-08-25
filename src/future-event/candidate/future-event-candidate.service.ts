import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../common/types/json.type';
import { DomainError } from '../../common/errors/domain-error';
import { FutureEventRepository } from '../future-event.repository';
import { FutureEventCandidate } from '../future-event.types';
import { FutureEventMonitoringAgentService } from '../monitoring/future-event-monitoring-agent.service';

@Injectable()
export class FutureEventCandidateService {
  constructor(
    private readonly futureEventRepository: FutureEventRepository,
    private readonly monitoringAgent: FutureEventMonitoringAgentService,
  ) {}

  listCandidates(input: { status?: string; take?: number } = {}) {
    return this.futureEventRepository.listCandidates(input);
  }

  async confirmCandidate(candidateId: string) {
    const candidate = await this.futureEventRepository.findCandidateById(candidateId);
    if (!candidate) {
      throw new DomainError('Future event candidate not found.', 'FUTURE_EVENT_CANDIDATE_NOT_FOUND', {
        candidateId,
      });
    }
    if (candidate.status === 'confirmed') {
      throw new DomainError('Future event candidate is already confirmed.', 'FUTURE_EVENT_CANDIDATE_ALREADY_CONFIRMED', {
        candidateId,
      });
    }

    const event = await this.futureEventRepository.createEvent({
      title: candidate.title,
      eventType: candidate.eventType,
      scheduledAt: candidate.scheduledAt ?? null,
      startAt: getTimeRangeDate(candidate, 'startAt'),
      endAt: getTimeRangeDate(candidate, 'endAt'),
      domains: normalizeStringArray(candidate.domains),
      summary: candidate.summary,
      whyItMatters: candidate.whyItMatters,
      status: 'confirmed',
      createdFrom: 'future_event_candidate',
      confidence: candidate.confidence,
      metadata: {
        candidateId: candidate.id,
        evidenceRefs: normalizeStringArray(candidate.evidenceRefs),
        suggestedKeywords: normalizeStringArray(candidate.suggestedKeywords),
        suggestedAccounts: normalizeStringArray(candidate.suggestedAccounts),
        suggestedPlatforms: normalizeStringArray(candidate.suggestedPlatforms),
        missingData: normalizeStringArray(candidate.missingData),
        riskNotes: normalizeStringArray(candidate.riskNotes),
        ruleVersion: 'future-event-candidate-confirmation@v1',
      },
    });

    await this.futureEventRepository.updateCandidateStatus({
      id: candidate.id,
      status: 'confirmed',
    });

    const monitoringPlan = await this.monitoringAgent.generateForEventId(
      event.id,
      '候选事件已确认，请基于候选信息生成默认需要人工确认的未来事件监控计划。',
    );

    return {
      event,
      monitoringPlan,
    };
  }
}

function getTimeRangeDate(
  candidate: FutureEventCandidate,
  field: 'startAt' | 'endAt',
) {
  const timeRange = (candidate as unknown as { timeRange?: unknown }).timeRange;
  if (!isRecord(timeRange)) return null;

  const value = timeRange[field];
  if (typeof value !== 'string' || !value.trim()) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
