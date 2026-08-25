import { Injectable } from '@nestjs/common';
import { FutureEvent, FutureEventCandidate } from '../future-event.types';

export interface FutureEventActionScore {
  total: number;
  impact: {
    scope: number;
    relevance: number;
    outcomeImportance: number;
  };
  evidence: number;
  heatMomentum: number;
  timeUrgency: number;
  contentReadiness: number;
  version: string;
}

interface ScoreContext {
  observedAt?: Date;
}

const SCORE_VERSION = 'future-event-action-score@v1';

@Injectable()
export class FutureEventActionScoreService {
  scoreCandidate(
    candidate: FutureEventCandidate,
    context: ScoreContext = {},
  ): FutureEventActionScore {
    return this.score({
      title: candidate.title,
      eventType: candidate.eventType,
      scheduledAt: candidate.scheduledAt ?? null,
      domains: candidate.domains,
      summary: candidate.summary,
      whyItMatters: candidate.whyItMatters,
      confidence: candidate.confidence,
      evidenceCount: candidate.evidenceRefs.length,
      contentHints: [
        ...candidate.suggestedKeywords,
        ...candidate.suggestedAccounts,
        ...candidate.suggestedPlatforms,
      ],
      missingDataCount: candidate.missingData.length,
      riskNoteCount: candidate.riskNotes.length,
      observedAt: context.observedAt,
    });
  }

  scoreEvent(
    event: FutureEvent,
    context: ScoreContext = {},
  ): FutureEventActionScore {
    const evidenceCount = getMetadataArray(event.metadata, 'evidence').length;
    return this.score({
      title: event.title,
      eventType: event.eventType,
      scheduledAt: event.scheduledAt ?? event.startAt ?? null,
      domains: event.domains,
      summary: event.summary ?? '',
      whyItMatters: event.whyItMatters ?? '',
      confidence: event.confidence,
      evidenceCount,
      contentHints: [],
      missingDataCount: getMetadataArray(event.metadata, 'missingData').length,
      riskNoteCount: getMetadataArray(event.metadata, 'riskNotes').length,
      observedAt: context.observedAt,
    });
  }

  private score(input: {
    title: string;
    eventType: string;
    scheduledAt: Date | null;
    domains: string[];
    summary: string;
    whyItMatters: string;
    confidence: 'high' | 'medium' | 'low';
    evidenceCount: number;
    contentHints: string[];
    missingDataCount: number;
    riskNoteCount: number;
    observedAt?: Date;
  }): FutureEventActionScore {
    const impact = {
      scope: scoreScope(input.eventType, input.domains),
      relevance: scoreRelevance(input.domains, `${input.title} ${input.summary} ${input.whyItMatters}`),
      outcomeImportance: scoreOutcomeImportance(input.title, input.eventType),
    };
    const evidence = scoreEvidence({
      confidence: input.confidence,
      evidenceCount: input.evidenceCount,
      missingDataCount: input.missingDataCount,
      riskNoteCount: input.riskNoteCount,
    });
    const heatMomentum = 0;
    const timeUrgency = scoreTimeUrgency(input.scheduledAt, input.observedAt ?? new Date());
    const contentReadiness = scoreContentReadiness({
      summary: input.summary,
      whyItMatters: input.whyItMatters,
      contentHints: input.contentHints,
      missingDataCount: input.missingDataCount,
      riskNoteCount: input.riskNoteCount,
    });

    return {
      total:
        impact.scope +
        impact.relevance +
        impact.outcomeImportance +
        evidence +
        heatMomentum +
        timeUrgency +
        contentReadiness,
      impact,
      evidence,
      heatMomentum,
      timeUrgency,
      contentReadiness,
      version: SCORE_VERSION,
    };
  }
}

function scoreScope(eventType: string, domains: string[]) {
  const normalized = normalizeText([eventType, ...domains].join(' '));
  if (includesAny(normalized, ['economic_data', 'policy_meeting', 'macro', 'finance', 'policy'])) {
    return 10;
  }
  if (includesAny(normalized, ['ai', 'web3', 'crypto'])) {
    return 7;
  }
  if (includesAny(normalized, ['holiday', 'calendar'])) {
    return 4;
  }
  return 4;
}

function scoreRelevance(domains: string[], text: string) {
  const normalized = normalizeText([domains.join(' '), text].join(' '));
  if (includesAny(normalized, ['macro', 'finance', 'policy', 'ai', 'web3', 'crypto', 'product'])) {
    return 8;
  }
  if (includesAny(normalized, ['market', 'release'])) {
    return 6;
  }
  return 3;
}

function scoreOutcomeImportance(title: string, eventType: string) {
  const normalized = normalizeText(`${title} ${eventType}`);
  if (includesAny(normalized, ['fomc', 'rate', 'interest', 'gdp', 'cpi', 'ppi', 'employment', 'jobs', 'payroll'])) {
    return 10;
  }
  if (includesAny(normalized, ['income', 'outlays', 'trade', 'profits', 'investment'])) {
    return 8;
  }
  if (includesAny(normalized, ['holiday', 'webinar'])) {
    return 3;
  }
  return 5;
}

function scoreEvidence(input: {
  confidence: 'high' | 'medium' | 'low';
  evidenceCount: number;
  missingDataCount: number;
  riskNoteCount: number;
}) {
  const confidenceScore = {
    high: 12,
    medium: 8,
    low: 4,
  }[input.confidence];
  const evidenceScore = Math.min(input.evidenceCount * 3, 5);
  const completenessScore = input.missingDataCount === 0 ? 2 : 0;
  const penalty = input.missingDataCount + input.riskNoteCount;
  return clamp(confidenceScore + evidenceScore + completenessScore - penalty, 0, 20);
}

function scoreTimeUrgency(scheduledAt: Date | null, observedAt: Date) {
  if (!scheduledAt) return 0;

  const diffDays = (scheduledAt.getTime() - observedAt.getTime()) / 86_400_000;
  if (diffDays < 0) return 0;
  if (diffDays <= 2) return 10;
  if (diffDays <= 30) return 8;
  if (diffDays <= 60) return 4;
  return 0;
}

function scoreContentReadiness(input: {
  summary: string;
  whyItMatters: string;
  contentHints: string[];
  missingDataCount: number;
  riskNoteCount: number;
}) {
  let score = 0;
  if (input.summary.trim()) score += 3;
  if (input.whyItMatters.trim()) score += 3;
  if (input.contentHints.length > 0) score += 2;
  if (input.contentHints.length >= 3) score += 2;
  if (input.summary.trim() && input.whyItMatters.trim() && input.missingDataCount === 0) {
    score = Math.max(score, 10);
  }

  return clamp(score - input.missingDataCount - input.riskNoteCount, 0, 10);
}

function getMetadataArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const item = (value as Record<string, unknown>)[key];
  return Array.isArray(item) ? item : [];
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
