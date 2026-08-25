import { Injectable } from '@nestjs/common';
import { TopicWatchRepository } from '../topic-watch.repository';
import {
  CreateTopicCandidateInput,
  TopicAggregationInput,
  TopicCandidate,
} from '../topic-watch.types';
import { Signal } from '../../signal/signal/signal.types';

@Injectable()
export class TopicAggregationService {
  constructor(private readonly topicWatchRepository: TopicWatchRepository) {}

  async aggregate(input: TopicAggregationInput): Promise<TopicCandidate[]> {
    const groups = this.groupSignals(input.signals);
    const candidates: TopicCandidate[] = [];

    for (const signals of groups.values()) {
      const candidateInput = this.createCandidateInput(
        input.topicWatchId,
        signals,
      );
      const candidate =
        await this.topicWatchRepository.createCandidate(candidateInput);
      candidates.push(candidate);
    }

    return candidates;
  }

  private groupSignals(signals: Signal[]): Map<string, Signal[]> {
    const groups = new Map<string, Signal[]>();

    for (const signal of signals) {
      const key = this.extractGroupKey(signal);
      const existing = groups.get(key) ?? [];
      existing.push(signal);
      groups.set(key, existing);
    }

    return groups;
  }

  private extractGroupKey(signal: Signal): string {
    const metadata = signal.metadata;

    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const entities = metadata.entities;
      if (Array.isArray(entities) && typeof entities[0] === 'string') {
        return entities[0].toLowerCase();
      }
    }

    return signal.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, ' ').trim();
  }

  private createCandidateInput(
    topicWatchId: string,
    signals: Signal[],
  ): CreateTopicCandidateInput {
    const sortedSignals = [...signals].sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
    );
    const entities = this.collectMetadataStrings(signals, 'entities');
    const keywords = this.collectMetadataStrings(signals, 'keywords');
    const sourceTypes = [...new Set(signals.map((signal) => signal.signalType))];
    const authors = this.collectMetadataStrings(signals, 'authorHandles');

    return {
      topicWatchId,
      title: sortedSignals[0].title,
      summary: this.createSummary(sortedSignals),
      keywords,
      entities,
      firstSeenAt: sortedSignals[0].observedAt,
      lastSeenAt: sortedSignals[sortedSignals.length - 1].observedAt,
      signalCount: signals.length,
      postCount: signals.filter((signal) => signal.signalType === 'post').length,
      accountCount: authors.length || null,
      sourceTypes,
      representativeSignalIds: sortedSignals.slice(0, 5).map((signal) => signal.id),
      evidenceRefs: [],
      metrics: {
        uniqueAuthors: authors.length,
        totalSignals: signals.length,
      },
      clustering: {
        method: 'hybrid',
        confidence: signals.length > 1 ? 'medium' : 'low',
      },
      status: 'new',
    };
  }

  private collectMetadataStrings(signals: Signal[], key: string): string[] {
    const values = new Set<string>();

    for (const signal of signals) {
      const metadata = signal.metadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        continue;
      }

      const raw = metadata[key];
      if (!Array.isArray(raw)) {
        continue;
      }

      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          values.add(item.trim());
        }
      }
    }

    return [...values];
  }

  private createSummary(signals: Signal[]): string {
    const titles = [...new Set(signals.map((signal) => signal.title))];
    return titles.slice(0, 3).join(' / ');
  }
}
