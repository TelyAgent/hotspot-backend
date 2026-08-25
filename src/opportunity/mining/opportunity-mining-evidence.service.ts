import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { Signal } from '../../signal/signal/signal.types';

export interface OpportunityMiningEvidenceMemory {
  signals: Signal[];
  evidence: EvidenceItem[];
  missingData: string[];
}

@Injectable()
export class OpportunityMiningEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async load(input: {
    seedSignalIds: string[];
    seedEvidenceIds?: string[];
    maxEvidencePerSignal?: number;
  }): Promise<OpportunityMiningEvidenceMemory> {
    const signals = await this.prisma.signal.findMany({
      where: {
        id: {
          in: input.seedSignalIds,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
    });
    const foundSignalIds = new Set(signals.map((signal) => signal.id));
    const missingData = input.seedSignalIds
      .filter((id) => !foundSignalIds.has(id))
      .map((id) => `Signal 不存在：${id}`);

    const evidenceFromSignals = await this.prisma.evidenceItem.findMany({
      where: {
        signalId: {
          in: signals.map((signal) => signal.id),
        },
      },
      take: Math.max(input.maxEvidencePerSignal ?? 20, 1) * Math.max(signals.length, 1),
      orderBy: {
        observedAt: 'desc',
      },
    });

    const evidenceById = input.seedEvidenceIds?.length
      ? await this.prisma.evidenceItem.findMany({
          where: {
            id: {
              in: input.seedEvidenceIds,
            },
          },
          orderBy: {
            observedAt: 'desc',
          },
        })
      : [];

    const evidence = this.dedupeEvidence([
      ...(evidenceFromSignals as unknown as EvidenceItem[]),
      ...(evidenceById as unknown as EvidenceItem[]),
    ]);

    return {
      signals: signals as unknown as Signal[],
      evidence,
      missingData,
    };
  }

  private dedupeEvidence(items: EvidenceItem[]): EvidenceItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    });
  }
}

