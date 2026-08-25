import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateEvidenceFromSignalInput,
  EvidenceItem,
} from './evidence.types';
import { EvidenceRepository } from './evidence.repository';

@Injectable()
export class EvidenceService {
  constructor(private readonly evidenceRepository: EvidenceRepository) {}

  async createFromSignal(
    input: CreateEvidenceFromSignalInput,
  ): Promise<EvidenceItem> {
    return this.evidenceRepository.create({
      signal: {
        connect: {
          id: input.signal.id,
        },
      },
      sourceType: input.sourceType,
      sourceItemId: input.sourceItemId ?? input.signal.id,
      claim: input.claim,
      text: input.text ?? null,
      url: input.url ?? null,
      author: input.author ?? null,
      publishedAt: input.publishedAt ?? null,
      observedAt: input.signal.observedAt,
      metrics: (input.metrics ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      confidence: input.confidence,
      rawRef: input.signal.rawItemId,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    });
  }
}
