import { JsonObject, JsonValue } from '../../common/types/json.type';

export interface AgentRunInput {
  agentType: string;
  goal: JsonObject;
  maxSteps?: number;
}

export interface AgentToolCallStepOutput {
  type: 'tool_call';
  toolName: string;
  reason: string;
  arguments: JsonObject;
  requestedFields?: string[];
  expectedFields?: string[];
}

export interface AgentFinalDecisionStepOutput {
  type: 'final_decision';
  decision: JsonObject;
}

export type AgentStepOutput =
  | AgentToolCallStepOutput
  | AgentFinalDecisionStepOutput;

export interface AgentRunResult {
  runId: string;
  status: 'succeeded' | 'failed';
  result?: JsonValue;
  errorMessage?: string;
}

export interface AgentWorkflowEngine {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
