export type EvidenceQualityLevel = 'strong' | 'usable' | 'thin' | 'insufficient';

export interface EvidenceQualityGateItem {
  id: string;
  sourceType: string;
  claim: string;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  confidence: string;
}

export interface EvidenceQualityGateInput {
  signalType: string;
  evidenceItems: EvidenceQualityGateItem[];
}

export interface EvidenceQualityGateResult {
  level: EvidenceQualityLevel;
  canCreateEvent: boolean;
  canUseHighConfidence: boolean;
  hasOpenableSource: boolean;
  hasReasonEvidence: boolean;
  hasActorActionObject: boolean;
  missingData: string[];
  riskNotes: string[];
}

export interface EnrichSignalEvidenceInput {
  signalId: string;
  signalType?: string;
  sourceContext?: Record<string, unknown>;
  mode: 'before_opportunity_mining' | 'before_topic_trigger' | 'manual_refresh';
  maxEvidence?: number;
}

export interface SignalEvidenceEnricherInput {
  signal: {
    id: string;
    signalType: string;
    title: string;
    rawItemId?: string;
    observedAt?: Date;
    metadata?: unknown;
  };
  mode: EnrichSignalEvidenceInput['mode'];
  maxEvidence?: number;
}

export interface SignalEvidenceEnricher {
  supports(signalType: string): boolean;
  enrich(input: SignalEvidenceEnricherInput): Promise<void>;
}

export interface EnrichedEvidencePackage {
  signalId: string;
  signalType: string;
  evidenceRefs: string[];
  evidenceItems: Array<{
    id: string;
    sourceType: string;
    claim: string;
    text?: string | null;
    url?: string | null;
    author?: string | null;
    publishedAt?: Date | null;
    observedAt: Date;
    confidence: string;
  }>;
  qualityGate: EvidenceQualityGateResult;
  conservativeTitle?: string;
  domainLabels: Array<{
    code: string;
    name: string;
    category: 'domain';
    evidenceRefs: string[];
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  enrichmentSummary: string;
}
