import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RawItem } from './raw-item.types';

@Injectable()
export class RawItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByDedupeKey(input: Prisma.RawItemCreateInput): Promise<RawItem> {
    return this.prisma.rawItem.upsert({
      where: {
        dedupeKey: input.dedupeKey,
      },
      create: input,
      update: {
        payload: input.payload,
        metadata: input.metadata,
        observedAt: input.observedAt,
        observedAtBucket: input.observedAtBucket,
      },
    }) as Promise<RawItem>;
  }

  async findById(id: string): Promise<RawItem | null> {
    return this.prisma.rawItem.findUnique({
      where: { id },
    }) as Promise<RawItem | null>;
  }
}
