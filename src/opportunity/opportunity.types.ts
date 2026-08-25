import { JsonObject } from '../common/types/json.type';

export type OpportunityConfidence = 'high' | 'medium' | 'low';

export interface Opportunity {
  id: string;
  title: string;
  type: string;
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow?: string | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status: 'suggested' | 'confirmed' | 'ignored' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: string;
  title: string;
  eventType: string;
  summary: string;
  occurredAt?: Date | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status: 'suggested' | 'confirmed' | 'ignored' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface OpportunityMiningDecision {
  decision:
    | 'create_opportunity'
    | 'create_event'
    | 'update_existing_opportunity'
    | 'create_insight'
    | 'ignore'
    | 'request_human_review';
  title: string;
  opportunityType:
    | 'news_event'
    | 'industry_topic'
    | 'viral_post'
    | 'viral_video'
    | 'meme'
    | 'competitor_signal'
    | 'future_event'
    | 'product_angle'
    | 'unknown';
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow: string;
  confidence: OpportunityConfidence;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  metadata?: JsonObject;
}

export interface CreateOpportunityInput {
  title: string;
  type: string;
  summary: string;
  whyNow: string;
  whyItMatters: string;
  productAngles: string[];
  contentWindow?: string | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status?: Opportunity['status'];
}

export interface CreateEventInput {
  title: string;
  eventType: string;
  summary: string;
  occurredAt?: Date | null;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: OpportunityConfidence;
  status?: Event['status'];
}
