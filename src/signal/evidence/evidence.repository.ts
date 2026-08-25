import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EvidenceItem } from './evidence.types';

@Injectable()
export class EvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Prisma.EvidenceItemCreateInput): Promise<EvidenceItem> {
    return this.prisma.evidenceItem.create({
      data: input,
    }) as Promise<EvidenceItem>;
  }

  async findById(id: string): Promise<EvidenceItem | null> {
    return this.prisma.evidenceItem.findUnique({
      where: { id },
    }) as Promise<EvidenceItem | null>;
  }

  async findMany(input: {
    signalId?: string;
    take?: number;
  } = {}): Promise<EvidenceItem[]> {
    return this.prisma.evidenceItem.findMany({
      where: input.signalId
        ? {
            signalId: input.signalId,
          }
        : undefined,
      take: input.take ?? 50,
      orderBy: {
        observedAt: 'desc',
      },
    }) as Promise<EvidenceItem[]>;
  }
}
