import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Signal } from './signal.types';

@Injectable()
export class SignalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Prisma.SignalCreateInput): Promise<Signal> {
    return this.prisma.signal.create({
      data: input,
    }) as Promise<Signal>;
  }

  async update(id: string, input: Prisma.SignalUpdateInput): Promise<Signal> {
    return this.prisma.signal.update({
      where: { id },
      data: input,
    }) as Promise<Signal>;
  }

  async findByRawItemAndType(input: {
    rawItemId: string;
    signalType: string;
  }): Promise<Signal | null> {
    return this.prisma.signal.findFirst({
      where: {
        rawItemId: input.rawItemId,
        signalType: input.signalType,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as Promise<Signal | null>;
  }

  async findById(id: string): Promise<Signal | null> {
    return this.prisma.signal.findUnique({
      where: { id },
    }) as Promise<Signal | null>;
  }

  async findMany(input: { take?: number; signalType?: string } = {}): Promise<Signal[]> {
    return this.prisma.signal.findMany({
      where: {
        ...(input.signalType ? { signalType: input.signalType } : {}),
      },
      take: input.take ?? 50,
      orderBy: {
        observedAt: 'desc',
      },
    }) as Promise<Signal[]>;
  }

  async findManyForMcp(input: {
    take?: number;
    signalType?: string;
    platform?: string;
    query?: string;
    since?: Date;
  } = {}): Promise<Signal[]> {
    const and: Prisma.SignalWhereInput[] = [];
    const query = input.query?.trim();
    const platform = input.platform?.trim();

    if (input.signalType) {
      and.push({ signalType: input.signalType });
    }

    if (platform) {
      and.push({
        OR: [
          { platform },
          { source: platform },
        ],
      });
    }

    if (query) {
      and.push({
        OR: [
          {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            summary: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (input.since) {
      and.push({
        observedAt: {
          gte: input.since,
        },
      });
    }

    return this.prisma.signal.findMany({
      where: and.length ? { AND: and } : undefined,
      take: input.take ?? 50,
      orderBy: {
        observedAt: 'desc',
      },
    }) as Promise<Signal[]>;
  }
}
