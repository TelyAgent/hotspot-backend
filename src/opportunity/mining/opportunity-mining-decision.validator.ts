import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { OpportunityMiningDecision } from '../opportunity.types';

const DECISIONS = new Set([
  'create_opportunity',
  'create_event',
  'update_existing_opportunity',
  'create_insight',
  'ignore',
  'request_human_review',
]);

const OPPORTUNITY_TYPES = new Set([
  'news_event',
  'industry_topic',
  'viral_post',
  'viral_video',
  'meme',
  'competitor_signal',
  'future_event',
  'product_angle',
  'unknown',
]);

const CONFIDENCES = new Set(['high', 'medium', 'low']);

@Injectable()
export class OpportunityMiningDecisionValidator {
  validate(decision: OpportunityMiningDecision): void {
    if (!DECISIONS.has(decision.decision)) {
      throw new DomainError(
        'Opportunity mining decision is not allowed.',
        'OPPORTUNITY_MINING_DECISION_NOT_ALLOWED',
        { decision: decision.decision },
      );
    }

    if (!OPPORTUNITY_TYPES.has(decision.opportunityType)) {
      throw new DomainError(
        'Opportunity mining opportunityType is not allowed.',
        'OPPORTUNITY_MINING_TYPE_NOT_ALLOWED',
        { opportunityType: decision.opportunityType },
      );
    }

    if (!CONFIDENCES.has(decision.confidence)) {
      throw new DomainError(
        'Opportunity mining confidence is not allowed.',
        'OPPORTUNITY_MINING_CONFIDENCE_NOT_ALLOWED',
        { confidence: decision.confidence },
      );
    }

    if (!Array.isArray(decision.productAngles)) {
      throw new DomainError(
        'Opportunity mining productAngles must be an array.',
        'OPPORTUNITY_MINING_PRODUCT_ANGLES_INVALID',
      );
    }

    this.validateEvidenceRefs(decision);
    this.validateReviewReason(decision);
  }

  private validateEvidenceRefs(decision: OpportunityMiningDecision): void {
    const needsEvidence =
      decision.decision === 'create_opportunity' ||
      decision.decision === 'create_event' ||
      decision.decision === 'update_existing_opportunity';

    if (needsEvidence && decision.evidenceRefs.length === 0) {
      throw new DomainError(
        'Opportunity mining decision requires evidence references.',
        'OPPORTUNITY_MINING_EVIDENCE_REQUIRED',
      );
    }
  }

  private validateReviewReason(decision: OpportunityMiningDecision): void {
    if (decision.decision !== 'request_human_review') {
      return;
    }

    if (decision.missingData.length === 0 && decision.riskNotes.length === 0) {
      throw new DomainError(
        'Opportunity mining human review decision requires missingData or riskNotes.',
        'OPPORTUNITY_MINING_REVIEW_REASON_REQUIRED',
      );
    }
  }
}

