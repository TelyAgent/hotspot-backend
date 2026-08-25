import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AgentRun,
  AgentRunStep,
  AgentToolCall,
  FinishAgentRunInput,
  RecordAgentRunStepInput,
  RecordToolCallInput,
  StartAgentRunInput,
} from './agent-run.types';

@Injectable()
export class AgentRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: StartAgentRunInput): Promise<AgentRun> {
    return this.prisma.agentRun.create({
      data: {
        agentType: input.agentType,
        status: 'running',
        goal: input.goal as Prisma.InputJsonValue,
        startedAt: input.startedAt ?? new Date(),
      },
    }) as Promise<AgentRun>;
  }

  async listRuns(input: {
    agentType?: string;
    status?: string;
    take?: number;
  } = {}): Promise<AgentRun[]> {
    return this.prisma.agentRun.findMany({
      where: {
        agentType: input.agentType,
        status: input.status,
      },
      take: input.take ?? 50,
      orderBy: {
        startedAt: 'desc',
      },
    }) as Promise<AgentRun[]>;
  }

  async findRunById(runId: string): Promise<AgentRun | null> {
    return this.prisma.agentRun.findUnique({
      where: {
        id: runId,
      },
    }) as Promise<AgentRun | null>;
  }

  async listSteps(runId: string): Promise<AgentRunStep[]> {
    return this.prisma.agentRunStep.findMany({
      where: {
        runId,
      },
      orderBy: {
        stepIndex: 'asc',
      },
    }) as Promise<AgentRunStep[]>;
  }

  async listToolCalls(runId: string): Promise<AgentToolCall[]> {
    return this.prisma.agentToolCall.findMany({
      where: {
        runId,
      },
      orderBy: {
        startedAt: 'asc',
      },
    }) as Promise<AgentToolCall[]>;
  }

  async recordToolCall(input: RecordToolCallInput): Promise<void> {
    await this.prisma.agentToolCall.create({
      data: {
        run: input.runId
          ? {
              connect: {
                id: input.runId,
              },
            }
          : undefined,
        toolName: input.toolName,
        status: input.status,
        input: input.input as Prisma.InputJsonValue,
        output: (input.output ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        errorMessage: input.errorMessage,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs:
          input.finishedAt.getTime() - input.startedAt.getTime(),
      },
    });
  }

  async recordStep(input: RecordAgentRunStepInput): Promise<AgentRunStep> {
    return this.prisma.agentRunStep.create({
      data: {
        run: {
          connect: {
            id: input.runId,
          },
        },
        stepIndex: input.stepIndex,
        stepType: input.stepType,
        input: (input.input ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        output: (input.output ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        reason: input.reason ?? null,
      },
    }) as Promise<AgentRunStep>;
  }

  async finishRun(input: FinishAgentRunInput): Promise<AgentRun> {
    return this.prisma.agentRun.update({
      where: {
        id: input.runId,
      },
      data: {
        status: input.status,
        result: (input.result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        errorMessage: input.errorMessage,
        finishedAt: input.finishedAt ?? new Date(),
      },
    }) as Promise<AgentRun>;
  }
}
