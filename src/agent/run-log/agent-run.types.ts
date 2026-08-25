import { JsonObject, JsonValue } from '../../common/types/json.type';

export type AgentRunStatus = 'running' | 'succeeded' | 'failed';
export type AgentToolCallStatus = 'succeeded' | 'failed';

export interface AgentRun {
  id: string;
  agentType: string;
  status: AgentRunStatus;
  goal: JsonValue;
  result?: JsonValue | null;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRunStep {
  id: string;
  runId: string;
  stepIndex: number;
  stepType: string;
  input?: JsonValue | null;
  output?: JsonValue | null;
  reason?: string | null;
  createdAt: Date;
}

export interface AgentToolCall {
  id: string;
  runId?: string | null;
  toolName: string;
  status: AgentToolCallStatus;
  input: JsonValue;
  output?: JsonValue | null;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  durationMs?: number | null;
  createdAt: Date;
}

export interface StartAgentRunInput {
  agentType: string;
  goal: JsonObject;
  startedAt?: Date;
}

export interface RecordToolCallInput {
  runId?: string;
  toolName: string;
  status: AgentToolCallStatus;
  input: JsonObject;
  output?: JsonValue;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface RecordAgentRunStepInput {
  runId: string;
  stepIndex: number;
  stepType: string;
  input?: JsonValue;
  output?: JsonValue;
  reason?: string;
}

export interface FinishAgentRunInput {
  runId: string;
  status: AgentRunStatus;
  result?: JsonValue;
  errorMessage?: string;
  finishedAt?: Date;
}
