import { JsonObject, JsonValue } from '../../common/types/json.type';

export type AgentToolPermission = 'read' | 'suggest_write' | 'high_risk';

export interface AgentToolLimits {
  maxCallsPerRun?: number;
  timeoutMs?: number;
}

export interface AgentToolFieldSelection {
  supported: boolean;
  allowedFields: string[];
  defaultFields: string[];
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  permission: AgentToolPermission;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  fieldSelection?: AgentToolFieldSelection;
  limits?: AgentToolLimits;
  execute(input: JsonObject): Promise<JsonValue>;
}

export interface ExecuteToolInput {
  runId?: string;
  toolName: string;
  arguments: JsonObject;
  requestedFields?: string[];
}

export interface ExecuteToolResult {
  toolName: string;
  output: JsonValue;
}
