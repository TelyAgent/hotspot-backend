import { JsonObject, JsonValue } from '../common/types/json.type';

export interface CopilotChatInput {
  sessionId?: string;
  tenantId: string;
  userId: string;
  client: string;
  message: string;
  context: JsonObject;
}

export interface CopilotProposedAction {
  id: string;
  tool: string;
  summary: string;
  arguments: JsonValue;
  requiresConfirmation: boolean;
  status: string;
}

export interface CopilotChatResponse {
  sessionId: string;
  runId?: string;
  message: string;
  proposedActions: CopilotProposedAction[];
  usedTools: JsonValue[];
  missingData: JsonValue[];
  suggestedNextSteps: JsonValue[];
}

export interface CopilotConfirmActionInput {
  confirmedBy: string;
}

export interface CopilotActionExecutionResponse {
  status: string;
  message: string;
  result?: unknown;
}
