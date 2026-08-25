import { JsonObject } from '../../common/types/json.type';
import { OpportunityRuleDocument } from '../rule-pack/opportunity-rule-pack.types';

export type OpportunityMiningGoalType =
  | 'detect_opportunity'
  | 'form_event'
  | 'analyze_hot_topic'
  | 'analyze_viral_content'
  | 'future_event_response';

export interface OpportunityMiningConstraints {
  maxToolCalls: number;
  maxRunMs: number;
  allowedToolCategories: string[];
  writeMode: 'suggest_only' | 'allow_create';
}

export interface OpportunityMiningGoal {
  id: string;
  type: OpportunityMiningGoalType;
  instruction: string;
  seedSignalIds: string[];
  seedEvidenceIds?: string[];
  sourceContext?: JsonObject;
  ruleDocuments: OpportunityRuleDocument[];
  constraints: OpportunityMiningConstraints;
}

export interface OpportunityMiningRunResult {
  decision: import('../opportunity.types').OpportunityMiningDecision;
  agentRunId?: string;
  target?: {
    type: 'opportunity' | 'event';
    id: string;
  };
}

export interface OpportunityMiningAgentResult {
  decision: import('../opportunity.types').OpportunityMiningDecision;
  agentRunId: string;
}
