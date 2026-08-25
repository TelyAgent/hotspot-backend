import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AssignmentDecision,
  AssignmentItem,
  AssignmentRun,
} from './assignment.types';

@Injectable()
export class AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: {
    targetType: string;
    targetId: string;
    goal: Prisma.InputJsonValue;
    startedAt: Date;
  }): Promise<AssignmentRun> {
    return this.prisma.assignmentRun.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: 'running',
        goal: input.goal,
        startedAt: input.startedAt,
      },
    }) as unknown as Promise<AssignmentRun>;
  }

  async finishRun(input: {
    runId: string;
    decision: AssignmentDecision;
    finishedAt: Date;
  }): Promise<AssignmentRun> {
    return this.prisma.assignmentRun.update({
      where: { id: input.runId },
      data: {
        status: 'succeeded',
        decision: input.decision as unknown as Prisma.InputJsonValue,
        confidence: input.decision.confidence,
        riskNotes: input.decision.riskNotes,
        missingData: input.decision.missingData,
        finishedAt: input.finishedAt,
      },
    }) as unknown as Promise<AssignmentRun>;
  }

  async createSuggestedItem(input: {
    runId: string;
    targetType: string;
    targetId: string;
    assignment: AssignmentDecision['assignments'][number];
  }): Promise<AssignmentItem> {
    return this.prisma.assignmentItem.create({
      data: {
        run: {
          connect: {
            id: input.runId,
          },
        },
        targetType: input.targetType,
        targetId: input.targetId,
        accountId: input.assignment.accountId,
        accountSource: input.assignment.accountSource,
        sourceSystem: input.assignment.sourceSystem,
        priority: input.assignment.priority,
        contentType: input.assignment.contentType,
        contentGoal: input.assignment.contentGoal,
        angle: input.assignment.angle,
        constraints: input.assignment.constraints,
        reason: input.assignment.reason,
        evidenceRefs: input.assignment.evidenceRefs,
        duplicateRisk: input.assignment.duplicateRisk,
        status: 'suggested',
      },
    }) as unknown as Promise<AssignmentItem>;
  }

  async listRuns(input: {
    targetType?: string;
    targetId?: string;
    take?: number;
  } = {}): Promise<AssignmentRun[]> {
    return this.prisma.assignmentRun.findMany({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
      },
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<AssignmentRun[]>;
  }

  async listItems(input: {
    targetType?: string;
    targetId?: string;
    status?: string;
    take?: number;
  } = {}): Promise<AssignmentItem[]> {
    return this.prisma.assignmentItem.findMany({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: input.status,
      },
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<AssignmentItem[]>;
  }

  async confirmItem(itemId: string): Promise<AssignmentItem> {
    const item = await this.prisma.assignmentItem.findUniqueOrThrow({
      where: { id: itemId },
    });

    const task =
      item.createdTaskId !== null
        ? await this.prisma.contentTask.findUniqueOrThrow({
            where: { id: item.createdTaskId },
          })
        : await this.prisma.contentTask.create({
            data: {
              targetType: item.targetType,
              targetId: item.targetId,
              accountId: item.accountId,
              contentType: item.contentType,
              contentGoal: item.contentGoal,
              angle: item.angle,
              constraints: item.constraints as Prisma.InputJsonValue,
              evidenceRefs: item.evidenceRefs as Prisma.InputJsonValue,
              status: 'confirmed',
            },
          });

    return this.prisma.assignmentItem.update({
      where: { id: itemId },
      data: {
        status: 'confirmed',
        createdTaskId: task.id,
      },
    }) as unknown as Promise<AssignmentItem>;
  }
}
