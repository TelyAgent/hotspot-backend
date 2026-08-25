import { Injectable } from '@nestjs/common';
import {
  AgentRun,
  AgentRunStep,
  AgentToolCall,
  FinishAgentRunInput,
  RecordAgentRunStepInput,
  RecordToolCallInput,
  StartAgentRunInput,
} from './agent-run.types';
import { AgentRunRepository } from './agent-run.repository';

@Injectable()
export class AgentRunLogService {
  constructor(private readonly agentRunRepository: AgentRunRepository) {}

  async startRun(input: StartAgentRunInput): Promise<AgentRun> {
    return this.agentRunRepository.createRun(input);
  }

  async listRuns(input: {
    agentType?: string;
    status?: string;
    take?: number;
  } = {}): Promise<AgentRun[]> {
    return this.agentRunRepository.listRuns(input);
  }

  async findRunById(runId: string): Promise<AgentRun | null> {
    return this.agentRunRepository.findRunById(runId);
  }

  async listSteps(runId: string): Promise<AgentRunStep[]> {
    return this.agentRunRepository.listSteps(runId);
  }

  async listToolCalls(runId: string): Promise<AgentToolCall[]> {
    return this.agentRunRepository.listToolCalls(runId);
  }

  async recordToolCall(input: RecordToolCallInput): Promise<void> {
    await this.agentRunRepository.recordToolCall(input);
  }

  async recordStep(input: RecordAgentRunStepInput): Promise<AgentRunStep> {
    return this.agentRunRepository.recordStep(input);
  }

  async finishRun(input: FinishAgentRunInput): Promise<AgentRun> {
    return this.agentRunRepository.finishRun(input);
  }
}
