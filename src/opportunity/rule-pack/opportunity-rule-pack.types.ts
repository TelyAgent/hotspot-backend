export type OpportunityRulePackStatus = 'preset' | 'draft' | 'active' | 'archived';

export interface OpportunityRuleDocument {
  id: string;
  title: string;
  path: string;
  markdown: string;
}

export interface OpportunityRuleRoute {
  signalType: string;
  documents: string[];
  lookbackHours: number;
  batchLimit: number;
  priority: 'high' | 'medium' | 'low';
}

export interface OpportunityRulePackSnapshot {
  id: string;
  version: number;
  status: OpportunityRulePackStatus;
  basePath: string;
  documents: OpportunityRuleDocument[];
  routes: OpportunityRuleRoute[];
}

export interface SelectOpportunityRuleDocumentsInput {
  signalType: string;
  goalType: string;
  rulePack: OpportunityRulePackSnapshot;
}

