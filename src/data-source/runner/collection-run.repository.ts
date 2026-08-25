import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CollectionJobConfig,
  CollectionRun,
} from './collection-job.types';

@Injectable()
export class CollectionRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createStarted(input: {
    jobConfig: CollectionJobConfig;
    startedAt: Date;
  }): Promise<CollectionRun> {
    return this.prisma.collectionRun.create({
      data: {
        jobId: input.jobConfig.id,
        pluginId: input.jobConfig.pluginId,
        capabilityId: input.jobConfig.capabilityId,
        status: 'running',
        startedAt: input.startedAt,
        input: input.jobConfig.params as Prisma.InputJsonValue,
      },
    }) as Promise<CollectionRun>;
  }

  async markSucceeded(input: {
    runId: string;
    finishedAt: Date;
    rawItemCount: number;
    outputSummary?: Prisma.InputJsonValue;
  }): Promise<CollectionRun> {
    return this.prisma.collectionRun.update({
      where: {
        id: input.runId,
      },
      data: {
        status: 'succeeded',
        finishedAt: input.finishedAt,
        rawItemCount: input.rawItemCount,
        outputSummary: input.outputSummary ?? Prisma.JsonNull,
      },
    }) as Promise<CollectionRun>;
  }

  async markFailed(input: {
    runId: string;
    finishedAt: Date;
    errorMessage: string;
  }): Promise<CollectionRun> {
    return this.prisma.collectionRun.update({
      where: {
        id: input.runId,
      },
      data: {
        status: 'failed',
        finishedAt: input.finishedAt,
        errorMessage: input.errorMessage,
      },
    }) as Promise<CollectionRun>;
  }

  async findMany(input: { take: number }): Promise<CollectionRun[]> {
    return this.prisma.collectionRun.findMany({
      take: input.take,
      orderBy: {
        startedAt: 'desc',
      },
    }) as Promise<CollectionRun[]>;
  }

  async findLatestByPlugin(input: {
    pluginId: string;
    statuses?: string[];
  }): Promise<CollectionRun | null> {
    return this.prisma.collectionRun.findFirst({
      where: {
        pluginId: input.pluginId,
        ...(input.statuses && input.statuses.length > 0
          ? {
              status: {
                in: input.statuses,
              },
            }
          : {}),
      },
      orderBy: {
        startedAt: 'desc',
      },
    }) as Promise<CollectionRun | null>;
  }
}
