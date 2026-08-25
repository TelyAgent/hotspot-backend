import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateSignalFromRawItemInput, Signal } from './signal.types';
import { SignalRepository } from './signal.repository';

@Injectable()
export class SignalService {
  constructor(private readonly signalRepository: SignalRepository) {}

  async createFromRawItem(
    input: CreateSignalFromRawItemInput,
  ): Promise<Signal> {
    return this.signalRepository.create({
      rawItem: {
        connect: {
          id: input.rawItem.id,
        },
      },
      source: input.rawItem.source,
      platform: input.platform ?? null,
      signalType: input.signalType,
      title: input.title,
      summary: input.summary ?? null,
      observedAt: input.rawItem.observedAt,
      rawRefs: [input.rawItem.id] as Prisma.InputJsonValue,
      metrics: (input.metrics ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    });
  }
}
