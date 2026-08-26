import { OpportunityConfidence } from '../opportunity/opportunity.types';

export type EventIdentityState =
  | 'rumored'
  | 'expected'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'denied'
  | 'unknown';

export interface EventIdentity {
  subject: string;
  action: string;
  object: string;
  time: {
    exactAt?: string;
    startAt?: string;
    endAt?: string;
    timezone?: string;
  };
  location?: string;
  state: EventIdentityState;
  coreFact: string;
}

export type EventMergeDimension =
  | 'subject'
  | 'action'
  | 'object'
  | 'time_location'
  | 'state'
  | 'core_fact';

export interface EventMergeDimensionResult {
  dimension: EventMergeDimension;
  label: string;
  score: number;
  result: 'compatible' | 'conflict' | 'uncertain';
  comparison: string;
  evidenceRefs: string[];
}

export interface EventMergeImpact {
  responseAction:
    | 'route_once'
    | 'route_independently'
    | 'update_context_only'
    | 'freeze_candidates'
    | 'review_published';
  reason: string;
}

export interface EventMergeAgentDecision {
  decision:
    | 'auto_merge'
    | 'keep_independent'
    | 'create_related_event';
  mergeConfidence: number;
  hardConflict: boolean;
  dimensionResults: EventMergeDimensionResult[];
  conflictPoints: string[];
  relationSuggestion?: {
    relationType:
      | 'follow_up'
      | 'official_result'
      | 'change'
      | 'correction'
      | 'reversal'
      | 'parent_child';
    reason: string;
  };
  impact: EventMergeImpact;
  evidenceRefs: string[];
}

export interface EventSourceContext {
  id: string;
  mainEventId?: string | null;
  sourceEventId?: string | null;
  sourceType: string;
  triggerType: string;
  triggerRuleCode?: string | null;
  ruleVersion?: string | null;
  contextVersion: number;
  title: string;
  summary: string;
  identity: EventIdentity;
  evidenceRefs: string[];
  signalRefs: string[];
  payload: Record<string, unknown>;
  triggeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventMergeDecision {
  id: string;
  incomingContextId: string;
  candidateMainEventId?: string | null;
  decision: EventMergeAgentDecision['decision'];
  mergeConfidence: number;
  hardConflict: boolean;
  dimensionResults: EventMergeDimensionResult[];
  conflictPoints: string[];
  evidenceRefs: string[];
  impact: EventMergeImpact;
  agentRunId?: string | null;
  decidedBy: string;
  decidedAt: Date;
  createdAt: Date;
}

export interface CreateSourceContextInput {
  mainEventId?: string;
  sourceEventId?: string;
  sourceType: string;
  triggerType: string;
  triggerRuleCode?: string;
  ruleVersion?: string;
  contextVersion?: number;
  title: string;
  summary: string;
  identity: EventIdentity;
  evidenceRefs: string[];
  signalRefs: string[];
  payload: Record<string, unknown>;
  triggeredAt: Date;
}

export interface CreateMergeDecisionInput {
  incomingContextId: string;
  candidateMainEventId?: string;
  decision: EventMergeAgentDecision['decision'];
  mergeConfidence: number;
  hardConflict: boolean;
  dimensionResults: EventMergeDimensionResult[];
  conflictPoints: string[];
  evidenceRefs: string[];
  impact: EventMergeImpact;
  agentRunId?: string;
  decidedBy: string;
}

export interface CreateEventRelationInput {
  fromEventId: string;
  toEventId: string;
  relationType: EventMergeAgentDecision['relationSuggestion'] extends {
    relationType: infer T;
  }
    ? T
    : string;
  reason: string;
  evidenceRefs: string[];
  createdBy: string;
}

export interface EventMergeDetailDto {
  eventId: string;
  contextVersion: number;
  sourceContexts: EventSourceContext[];
  latestIdentityDecision?: {
    mergeConfidence: number;
    decision: string;
    dimensionResults: EventMergeDimensionResult[];
    conflictPoints: string[];
    systemAction: string;
    reason: string;
  };
  relations: EventRelationDto[];
}

export interface EventRelationDto {
  id: string;
  fromEventId: string;
  toEventId: string;
  relationType: string;
  reason: string;
  evidenceRefs: string[];
  createdBy: string;
  createdAt: Date;
}

export type EventMergeConfidence = OpportunityConfidence;
