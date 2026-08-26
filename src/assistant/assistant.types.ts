import { JsonObject } from '../common/types/json.type';

export interface AssistantChatContext {
  page: string;
  setting?: string;
  region?: string;
  event?: string;
}

export type AssistantToolName =
  | 'get_twitter_config'
  | 'update_twitter_config'
  | 'list_twitter_topics'
  | 'upsert_twitter_topic'
  | 'add_twitter_topic_account'
  | 'remove_twitter_topic_account'
  | 'set_twitter_trend_schedule';

export interface AssistantProposedAction {
  id: string;
  tool: AssistantToolName;
  summary: string;
  arguments: JsonObject;
  requiresConfirmation: true;
}

export interface AssistantChatResponse {
  message: string;
  proposedActions?: AssistantProposedAction[];
}

export interface AssistantChatInput {
  message: string;
  context: AssistantChatContext;
}

export interface AssistantToolExecutionInput {
  tool: AssistantToolName;
  arguments: JsonObject;
}

export interface AssistantToolExecutionResponse {
  message: string;
  result?: unknown;
}
