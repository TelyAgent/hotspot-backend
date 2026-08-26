import { Injectable } from '@nestjs/common';
import { OpportunityRepository } from '../../opportunity/opportunity.repository';
import { TopicWatchRepository } from '../topic-watch.repository';
import { TopicCandidate, TopicWatch } from '../topic-watch.types';

export interface TopicWatchTriggerResult {
  checkedCount: number;
  triggeredCount: number;
  skippedCount: number;
}

@Injectable()
export class TopicWatchTriggerService {
  constructor(
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly opportunityRepository: OpportunityRepository,
  ) {}

  async evaluateAndTrigger(input: {
    topicWatch: TopicWatch;
    candidates: TopicCandidate[];
  }): Promise<TopicWatchTriggerResult> {
    let triggeredCount = 0;
    let skippedCount = 0;

    for (const candidate of input.candidates) {
      if (candidate.status === 'converted_to_event') {
        skippedCount += 1;
        continue;
      }

      const matchedRules = this.matchRules(candidate);
      if (matchedRules.length === 0) {
        skippedCount += 1;
        continue;
      }

      const evidenceRefs = await this.resolveEvidenceRefs(candidate);
      await this.opportunityRepository.createEvent({
        title: candidate.title,
        eventType: 'industry_topic',
        summary: candidate.summary,
        evidenceRefs,
        missingData: this.createMissingData(candidate),
        riskNotes: [],
        confidence: this.resolveConfidence(matchedRules),
        status: 'suggested',
      });
      await this.topicWatchRepository.createDecision({
        topicWatchId: input.topicWatch.id,
        decision: 'create_event',
        title: candidate.title,
        summary: candidate.summary,
        matchedRules,
        evidenceRefs,
        missingData: this.createMissingData(candidate),
        riskNotes: [],
        confidence: this.resolveConfidence(matchedRules),
      });
      await this.topicWatchRepository.updateCandidateStatus({
        candidateId: candidate.id,
        status: 'converted_to_event',
      });
      triggeredCount += 1;
    }

    return {
      checkedCount: input.candidates.length,
      triggeredCount,
      skippedCount,
    };
  }

  private matchRules(candidate: TopicCandidate) {
    const b3h = getNumber(candidate.metrics.b3h);
    const b24h = getNumber(candidate.metrics.b24h);
    const tmax = getNumber(candidate.metrics.tmax);
    const tmaxTop5Percent = candidate.metrics.tmaxTop5Percent === true;
    const matchedRules: string[] = [];

    if (b3h >= 3) matchedRules.push('TC-01');
    if (b24h >= 6) matchedRules.push('TC-02');
    if (tmax >= 3 && tmaxTop5Percent) matchedRules.push('TC-03');
    if (b3h >= 2 && tmax >= 2) matchedRules.push('TC-04');

    return matchedRules;
  }

  private async resolveEvidenceRefs(candidate: TopicCandidate) {
    if (candidate.evidenceRefs.length > 0) {
      return candidate.evidenceRefs;
    }

    const evidenceItems = await this.topicWatchRepository.listEvidenceBySignalIds(
      candidate.representativeSignalIds,
    );
    return evidenceItems.map((item) => item.id);
  }

  private createMissingData(candidate: TopicCandidate) {
    return candidate.metrics.tmaxTop5Percent == null
      ? ['缺少账号近期表现前 5% 的历史基准判断。']
      : [];
  }

  private resolveConfidence(matchedRules: string[]): 'high' | 'medium' | 'low' {
    return matchedRules.includes('TC-01') || matchedRules.includes('TC-02')
      ? 'high'
      : 'medium';
  }
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
