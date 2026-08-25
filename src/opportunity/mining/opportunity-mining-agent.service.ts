import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { Signal } from '../../signal/signal/signal.types';
import { TopicCandidate } from '../../topic-watch/topic-watch.types';
import { OpportunityMiningDecision } from '../opportunity.types';
import { OpportunityMiningDecisionValidator } from './opportunity-mining-decision.validator';
import {
  OpportunityMiningAgentResult,
  OpportunityMiningGoal,
} from './opportunity-mining-goal.types';

@Injectable()
export class OpportunityMiningAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly decisionValidator: OpportunityMiningDecisionValidator,
  ) {}

  async evaluateGoal(
    goal: OpportunityMiningGoal,
    memory: {
      signals?: Signal[];
      evidence?: EvidenceItem[];
      topicCandidates?: TopicCandidate[];
    } = {},
  ): Promise<OpportunityMiningDecision> {
    return (await this.evaluateGoalWithRun(goal, memory)).decision;
  }

  async evaluateGoalWithRun(
    goal: OpportunityMiningGoal,
    memory: {
      signals?: Signal[];
      evidence?: EvidenceItem[];
      topicCandidates?: TopicCandidate[];
    } = {},
  ): Promise<OpportunityMiningAgentResult> {
    if (goal.ruleDocuments.length === 0) {
      throw new DomainError(
        'Opportunity mining goal requires rule documents.',
        'OPPORTUNITY_MINING_RULE_DOCUMENTS_REQUIRED',
      );
    }

    const result = await this.workflowEngine.run({
      agentType: 'opportunity_mining',
      goal: this.toJsonObject({
        ...goal,
        evidenceMemory: {
          signals: (memory.signals ?? []).map((signal) => this.serializeSignal(signal)),
          evidence: (memory.evidence ?? []).map((item) => this.serializeEvidence(item)),
          topicCandidates: (memory.topicCandidates ?? []).map((candidate) =>
            this.serializeTopicCandidate(candidate),
          ),
        },
      }),
      maxSteps: Math.max(goal.constraints.maxToolCalls, 1),
    });

    const decision = this.parseResult(result);
    this.decisionValidator.validate(decision);
    return {
      decision,
      agentRunId: result.runId,
    };
  }

  async evaluate(input: {
    instruction: string;
    signals?: Signal[];
    evidence?: EvidenceItem[];
    topicCandidates?: TopicCandidate[];
  }): Promise<OpportunityMiningDecision> {
    return this.evaluateGoal(
      {
        id: 'legacy-opportunity-mining-goal',
        type: 'detect_opportunity',
        instruction: input.instruction,
        seedSignalIds: (input.signals ?? []).map((signal) => signal.id),
        seedEvidenceIds: (input.evidence ?? []).map((item) => item.id),
        ruleDocuments: [
          {
            id: 'legacy-input-rules',
            title: '兼容输入规则',
            path: 'memory://legacy-input-rules.md',
            markdown:
              '# 兼容输入规则\n\n根据调用方传入的 Signal、Evidence 和 TopicCandidate 判断是否形成机会。',
          },
        ],
        constraints: {
          maxToolCalls: 6,
          maxRunMs: 60_000,
          allowedToolCategories: ['read'],
          writeMode: 'suggest_only',
        },
      },
      {
        signals: input.signals,
        evidence: input.evidence,
        topicCandidates: input.topicCandidates,
      },
    );
  }

  private parseResult(result: {
    runId?: string;
    status: 'succeeded' | 'failed';
    result?: unknown;
    errorMessage?: string;
  }): OpportunityMiningDecision {
    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Opportunity mining agent failed.',
        'OPPORTUNITY_MINING_AGENT_FAILED',
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);
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

  private toJsonObject(value: unknown): JsonObject {
    return value as JsonObject;
  }
}
