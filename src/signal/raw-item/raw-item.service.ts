import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JsonValue } from '../../common/types/json.type';
import { CreateRawItemInput, RawItem } from './raw-item.types';
import { RawItemRepository } from './raw-item.repository';

@Injectable()
export class RawItemService {
  constructor(private readonly rawItemRepository: RawItemRepository) {}

  async create(input: CreateRawItemInput): Promise<RawItem> {
    const observedAtBucket = this.toObservedAtBucket(input.observedAt);
    const dedupeKey = this.createDedupeKey(input, observedAtBucket);

    return this.rawItemRepository.upsertByDedupeKey({
      source: input.source,
      sourceType: input.sourceType,
      sourceItemId: input.sourceItemId ?? null,
      observedAt: input.observedAt,
      observedAtBucket,
      payload: input.payload as Prisma.InputJsonValue,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      dedupeKey,
    });
  }

  private toObservedAtBucket(observedAt: Date): Date {
    const bucket = new Date(observedAt);
    bucket.setUTCMinutes(0, 0, 0);
    return bucket;
  }

  private createDedupeKey(
    input: CreateRawItemInput,
    observedAtBucket: Date,
  ): string {
    const itemIdentity =
      input.sourceItemId ?? this.hashJsonValue(input.payload).slice(0, 24);

    return [
      input.source,
      input.sourceType,
      itemIdentity,
      observedAtBucket.toISOString(),
    ].join(':');
  }

  private hashJsonValue(value: JsonValue): string {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  }
}
