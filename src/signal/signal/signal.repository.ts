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
}
