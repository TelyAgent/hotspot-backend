import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PrismaService } from '../../database/prisma.service';
import { EventDomainLabelService } from '../../opportunity/labeling/event-domain-label.service';
import { EvidenceQualityGateService } from './evidence-quality-gate.service';
import { SIGNAL_EVIDENCE_ENRICHERS } from './signal-evidence-enrichment.tokens';
import {
  EnrichedEvidencePackage,
  EnrichSignalEvidenceInput,
  SignalEvidenceEnricher,
} from './signal-evidence-enrichment.types';

@Injectable()
export class SignalEvidenceEnrichmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityGate: EvidenceQualityGateService,
    private readonly eventDomainLabelService: EventDomainLabelService,
    @Inject(SIGNAL_EVIDENCE_ENRICHERS)
    @Optional()
    private readonly strategies: SignalEvidenceEnricher[] = [],
  ) {}

  async enrich(
    input: EnrichSignalEvidenceInput,
  ): Promise<EnrichedEvidencePackage> {
    const signal = await this.prisma.signal.findUnique({
      where: {
        id: input.signalId,
      },
    });
    if (!signal) {
      throw new DomainError('Signal 不存在。', 'SIGNAL_NOT_FOUND', {
        signalId: input.signalId,
      });
    }

    const strategyErrors: string[] = [];
    for (const strategy of this.strategies) {
      if (!strategy.supports(signal.signalType)) {
        continue;
      }
      try {
        await strategy.enrich({
          signal,
          mode: input.mode,
          maxEvidence: input.maxEvidence,
        });
      } catch (error) {
        strategyErrors.push(
          error instanceof Error ? error.message : '证据补全策略执行失败。',
        );
      }
    }

    const evidenceItems = await this.prisma.evidenceItem.findMany({
      where: {
        signalId: signal.id,
      },
      orderBy: {
        observedAt: 'desc',
      },
      take: input.maxEvidence ?? 20,
    });
    const baseQualityGate = this.qualityGate.evaluate({
      signalType: signal.signalType,
      evidenceItems: evidenceItems.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        claim: item.claim,
        text: item.text,
        url: item.url,
        author: item.author,
        confidence: item.confidence,
      })),
    });
    const qualityGate = strategyErrors.length
      ? {
          ...baseQualityGate,
          missingData: [
            ...baseQualityGate.missingData,
            ...strategyErrors.map((message) => `证据补全失败：${message}`),
          ],
        }
      : baseQualityGate;
    const domainLabels = this.eventDomainLabelService
      .buildDomainLabels({
        evidence: evidenceItems.map((item) => ({
          id: item.id,
          sourceType: item.sourceType,
          claim: item.claim,
          text: item.text,
          confidence: item.confidence,
        })),
      })
      .filter((label) => label.category === 'domain')
      .map((label) => ({
        code: label.code,
        name: label.name,
        category: 'domain' as const,
        evidenceRefs: label.evidenceRefs,
        reason: label.reason,
        confidence: label.confidence,
      }));

    return {
      signalId: signal.id,
      signalType: signal.signalType,
      evidenceRefs: evidenceItems.map((item) => item.id),
      evidenceItems: evidenceItems.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        claim: item.claim,
        text: item.text,
        url: item.url,
        author: item.author,
        publishedAt: item.publishedAt,
        observedAt: item.observedAt,
        confidence: item.confidence,
      })),
      qualityGate,
      conservativeTitle: this.createConservativeTitle({
        signalType: signal.signalType,
        title: signal.title,
        metadata: signal.metadata,
      }),
      domainLabels,
      enrichmentSummary: qualityGate.missingData.length
        ? qualityGate.missingData.join('；')
        : '证据已补全。',
    };
  }

  private createConservativeTitle(input: {
    signalType: string;
    title: string;
    metadata: unknown;
  }) {
    if (input.signalType === 'x_trend') {
      const region = getMetadataString(input.metadata, 'region') ?? '未知地区';
      return `${region} X 热搜：${input.title}`;
    }

    if (input.signalType === 'youtube_video') {
      return `YouTube 视频：${input.title}`;
    }

    if (input.signalType === 'future_event') {
      return `未来事件：${input.title}`;
    }

    return input.title;
  }
}

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
