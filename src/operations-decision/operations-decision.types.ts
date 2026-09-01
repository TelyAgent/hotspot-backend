import { JsonObject, JsonValue } from '../common/types/json.type';

export interface PredxNewsItemInput {
  externalId: string;
  eventId?: string | null;
  factId?: string | null;
  title: string;
  newsTitle?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  publishedAt: Date;
  latestAt?: Date | null;
  primaryMarketTitle?: string | null;
  primaryMarketUrl?: string | null;
  primaryMarketConfidence?: number | null;
  associatedMarketDisplayScore?: number | null;
  relatedMarkets: JsonValue[];
  raw: JsonObject;
}

export interface OperationRecommendationDecision {
  title: string;
  summary: string;
  recommendationLabels: string[];
  basis: 'heat' | 'market' | 'product';
  priority: 'immediate' | 'today';
  reason: string;
  predxOpportunity: {
    status: 'supported' | 'none';
    associationLevel:
      | 'L1_direct'
      | 'L2_analogous'
      | 'L3_thematic'
      | 'L4_conceptual'
      | 'none';
    rationale: string;
    selectedProductValue: string;
    recommendedProductPage: 'home' | 'news' | 'market' | 'signal';
    recommendedProductUrl: string;
    urlReason: string;
  };
  angles: Array<{
    level: string;
    claim: string;
    targetUser?: string;
    userValue?: string;
    evidence: string[];
    productUrl?: string;
    riskNotes: string[];
  }>;
  evidenceRefs: string[];
  missingData: string[];
  riskNotes: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface OperationRecommendationEvidenceItem {
  id: string;
  sourceType: string;
  sourceName?: string | null;
  authorName?: string | null;
  title?: string | null;
  summary: string;
  text?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  observedAt: string;
  metrics?: unknown;
  confidence: string;
}
