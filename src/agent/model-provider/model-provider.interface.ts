import { JsonObject } from '../../common/types/json.type';
import { AgentToolDefinition } from '../tool-registry/agent-tool.interface';
import { AgentStepOutput } from '../workflow-engine/agent-workflow-engine.interface';

export interface ModelProviderInput {
  agentType: string;
  goal: JsonObject;
  stepIndex: number;
  evidence: JsonObject[];
  toolResults: JsonObject[];
  availableTools?: AgentToolDefinition[];
}

export interface ModelProvider {
  completeStructured(input: ModelProviderInput): Promise<AgentStepOutput>;
}
