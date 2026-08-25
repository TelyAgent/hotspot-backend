import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { Signal } from '../../signal/signal/signal.types';
import { TopicCandidate } from '../../topic-watch/topic-watch.types';
import { OpportunityMiningDecision } from '../opportunity.types';

@Injectable()
export class OpportunityMiningAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
  ) {}

  async evaluate(input: {
    instruction: string;
    signals?: Signal[];
    evidence?: EvidenceItem[];
    topicCandidates?: TopicCandidate[];
  }): Promise<OpportunityMiningDecision> {
    const result = await this.workflowEngine.run({
      agentType: 'opportunity_mining',
      goal: {
        instruction: input.instruction,
        signals: (input.signals ?? []).map((signal) => this.serializeSignal(signal)),
        evidence: (input.evidence ?? []).map((item) => this.serializeEvidence(item)),
        topicCandidates: (input.topicCandidates ?? []).map((candidate) =>
          this.serializeTopicCandidate(candidate),
        ),
      },
      maxSteps: 6,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Opportunity mining agent failed.',
        'OPPORTUNITY_MINING_AGENT_FAILED',
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);
    this.validateEvidenceRefs(decision);
    return decision;
  }

  private parseDecision(value: JsonObject): OpportunityMiningDecision {
    const required = [
      'decision',
      'title',
      'opportunityType',
      'summary',
      'whyNow',
      'whyItMatters',
      'productAngles',
      'contentWindow',
      'confidence',
      'evidenceRefs',
      'missingData',
      'riskNotes',
    ];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Opportunity mining decision missing field: ${key}`,
          'OPPORTUNITY_MINING_DECISION_INVALID',
          { field: key },
        );
      }
    }

    return value as unknown as OpportunityMiningDecision;
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

  private serializeSignal(signal: Signal): JsonObject {
    return {
      id: signal.id,
      source: signal.source,
      platform: signal.platform ?? null,
      signalType: signal.signalType,
      title: signal.title,
      summary: signal.summary ?? null,
      observedAt: signal.observedAt.toISOString(),
      metrics: signal.metrics ?? null,
      metadata: signal.metadata ?? null,
    };
  }

  private serializeEvidence(evidence: EvidenceItem): JsonObject {
    return {
      id: evidence.id,
      sourceType: evidence.sourceType,
      claim: evidence.claim,
      text: evidence.text ?? null,
      url: evidence.url ?? null,
      confidence: evidence.confidence,
      observedAt: evidence.observedAt.toISOString(),
    };
  }

  private serializeTopicCandidate(candidate: TopicCandidate): JsonObject {
    return {
      id: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      signalCount: candidate.signalCount,
      postCount: candidate.postCount ?? null,
      accountCount: candidate.accountCount ?? null,
      evidenceRefs: candidate.evidenceRefs,
      metrics: candidate.metrics,
    };
  }
}
