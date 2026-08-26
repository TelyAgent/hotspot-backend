import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JsonObject } from '../../common/types/json.type';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { OpportunityRulePackLoaderService } from '../rule-pack/opportunity-rule-pack-loader.service';
import { OpportunityMiningDecision } from '../opportunity.types';
import { OpportunityRepository } from '../opportunity.repository';
import { OpportunityMiningAgentService } from './opportunity-mining-agent.service';
import { OpportunityMiningDecisionValidator } from './opportunity-mining-decision.validator';
import { OpportunityMiningEvidenceService } from './opportunity-mining-evidence.service';
import { EventLabelingService } from '../labeling/event-labeling.service';
import { EventIdentity } from '../../event-merge/event-merge.types';
import { EventMergeRepository } from '../../event-merge/event-merge.repository';
import { EventMergeOrchestratorService } from '../../event-merge/event-merge-orchestrator.service';
import {
  OpportunityMiningGoal,
  OpportunityMiningRunResult,
} from './opportunity-mining-goal.types';

@Injectable()
export class OpportunityMiningOrchestratorService {
  constructor(
    private readonly evidenceService: OpportunityMiningEvidenceService,
    private readonly rulePackLoader: OpportunityRulePackLoaderService,
    private readonly miningAgentService: OpportunityMiningAgentService,
    private readonly decisionValidator: OpportunityMiningDecisionValidator,
    private readonly opportunityRepository: OpportunityRepository,
    private readonly eventLabelingService: EventLabelingService,
    private readonly eventMergeRepository: EventMergeRepository,
    private readonly eventMergeOrchestrator: EventMergeOrchestratorService,
  ) {}

  async run(input: {
    goal: Omit<OpportunityMiningGoal, 'ruleDocuments'> &
      Partial<Pick<OpportunityMiningGoal, 'ruleDocuments'>>;
  }): Promise<OpportunityMiningRunResult> {
    const memory = await this.evidenceService.load({
      seedSignalIds: input.goal.seedSignalIds,
      seedEvidenceIds: input.goal.seedEvidenceIds,
    });
    const rulePack = await this.rulePackLoader.loadActiveRulePack();
    const signalType =
      memory.signals[0]?.signalType ??
      this.optionalString(input.goal.sourceContext?.signalType) ??
      'default';
    const ruleDocuments =
      input.goal.ruleDocuments ??
      this.rulePackLoader.selectDocuments({
        signalType,
        goalType: input.goal.type,
        rulePack,
      });

    const goal: OpportunityMiningGoal = {
      ...input.goal,
      ruleDocuments,
      sourceContext: {
        ...(input.goal.sourceContext ?? {}),
        rulePack: {
          id: rulePack.id,
          version: rulePack.version,
          selectedDocumentIds: ruleDocuments.map((document) => document.id),
        },
        missingDataFromSeed: memory.missingData,
      },
    };

    const seedSignalId = input.goal.seedSignalIds[0];
    const idempotencyKey = seedSignalId ? `${goal.id}:${seedSignalId}` : undefined;
    let agentRunId: string | undefined;
    let decision: OpportunityMiningDecision;

    try {
      const agentResult = await this.miningAgentService.evaluateGoalWithRun(goal, {
        signals: memory.signals,
        evidence: memory.evidence,
      });
      agentRunId = agentResult.agentRunId;
      decision = this.normalizeEvidenceRefs(agentResult.decision, memory.evidence);
    } catch (error) {
      if (seedSignalId && idempotencyKey) {
        await this.opportunityRepository.createMiningSignalRun({
          signalId: seedSignalId,
          status: 'failed',
          idempotencyKey,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }

    this.decisionValidator.validate(decision);

    if (goal.constraints.writeMode === 'allow_create') {
      const result = await this.persistDecision(decision, memory.evidence, agentRunId);
      await this.recordMiningRun({
        seedSignalId,
        idempotencyKey,
        agentRunId,
        decision,
        target: result.target,
      });
      return result;
    }

    await this.recordMiningRun({
      seedSignalId,
      idempotencyKey,
      agentRunId,
      decision,
    });

    return {
      decision,
      agentRunId,
    };
  }

  private normalizeEvidenceRefs(
    decision: OpportunityMiningDecision,
    evidence: Array<{ id: string }>,
  ): OpportunityMiningDecision {
    const validEvidenceIds = new Set(evidence.map((item) => item.id));
    const normalizedRefs = this.uniqueStrings(decision.evidenceRefs).filter((ref) =>
      validEvidenceIds.has(ref),
    );

    if (normalizedRefs.length > 0) {
      return {
        ...decision,
        evidenceRefs: normalizedRefs,
      };
    }

    const fallbackRefs = evidence.map((item) => item.id);
    if (fallbackRefs.length === 0) {
      return decision;
    }

    return {
      ...decision,
      evidenceRefs: this.uniqueStrings(fallbackRefs),
      missingData: this.uniqueStrings([
        ...decision.missingData,
        'Agent 返回的证据引用不是系统内真实证据，已使用当前 Signal 的真实证据回填。',
      ]),
    };
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
  }

  createGoal(input: {
    instruction: string;
    seedSignalIds?: string[];
    seedEvidenceIds?: string[];
    sourceContext?: JsonObject;
    writeMode?: OpportunityMiningGoal['constraints']['writeMode'];
    type?: OpportunityMiningGoal['type'];
  }): Omit<OpportunityMiningGoal, 'ruleDocuments'> {
    return {
      id: `opmine_${randomUUID()}`,
      type: input.type ?? 'detect_opportunity',
      instruction: input.instruction,
      seedSignalIds: input.seedSignalIds ?? [],
      seedEvidenceIds: input.seedEvidenceIds,
      sourceContext: input.sourceContext,
      constraints: {
        maxToolCalls: 6,
        maxRunMs: 60_000,
        allowedToolCategories: ['read'],
        writeMode: input.writeMode ?? 'suggest_only',
      },
    };
  }

  private async persistDecision(
    decision: OpportunityMiningDecision,
    evidence: EvidenceItem[],
    agentRunId?: string,
  ): Promise<OpportunityMiningRunResult> {
    if (decision.decision === 'create_event') {
      const matchedEvidence = evidence.filter((item) =>
        decision.evidenceRefs.includes(item.id),
      );
      const labels = await this.eventLabelingService.buildLabels({
        evidence: matchedEvidence,
      });
      const event = await this.opportunityRepository.createEvent({
        title: decision.title,
        eventType: decision.opportunityType,
        summary: decision.summary,
        evidenceRefs: decision.evidenceRefs,
        missingData: decision.missingData,
        riskNotes: decision.riskNotes,
        labels,
        confidence: decision.confidence,
        status: 'suggested',
      });
      const sourceContext = await this.eventMergeRepository.createSourceContext({
        mainEventId: event.id,
        sourceType: this.inferSourceType(labels, matchedEvidence),
        sourceEventId:
          matchedEvidence[0]?.sourceItemId ?? matchedEvidence[0]?.signalId ?? undefined,
        triggerType: this.inferTriggerType(labels, decision),
        triggerRuleCode: this.inferTriggerRuleCode(labels),
        ruleVersion: this.optionalString(decision.metadata?.ruleVersion),
        title: decision.title,
        summary: decision.summary,
        identity: this.buildEventIdentity(decision, matchedEvidence),
        evidenceRefs: decision.evidenceRefs,
        signalRefs: this.uniqueStrings(
          matchedEvidence
            .map((item) => item.signalId)
            .filter((value): value is string => Boolean(value)),
        ),
        triggeredAt: matchedEvidence[0]?.observedAt ?? new Date(),
        payload: {
          title: decision.title,
          opportunityType: decision.opportunityType,
          labels,
          summary: decision.summary,
          agentRunId,
        },
      });
      await this.eventMergeOrchestrator.processIncomingContext(sourceContext);

      return {
        decision,
        agentRunId,
        target: {
          type: 'event',
          id: event.id,
        },
      };
    }

    if (decision.decision === 'create_opportunity') {
      const opportunity = await this.opportunityRepository.createOpportunity({
        title: decision.title,
        type: decision.opportunityType,
        summary: decision.summary,
        whyNow: decision.whyNow,
        whyItMatters: decision.whyItMatters,
        productAngles: decision.productAngles,
        contentWindow: decision.contentWindow,
        evidenceRefs: decision.evidenceRefs,
        missingData: decision.missingData,
        riskNotes: decision.riskNotes,
        confidence: decision.confidence,
        status: 'suggested',
      });

      return {
        decision,
        agentRunId,
        target: {
          type: 'opportunity',
          id: opportunity.id,
        },
      };
    }

    return {
      decision,
      agentRunId,
    };
  }

  private inferSourceType(
    labels: Awaited<ReturnType<EventLabelingService['buildLabels']>>,
    evidence: EvidenceItem[],
  ): string {
    const sourceLabel = labels.find((label) => label.category === 'source');
    return (
      this.optionalString(sourceLabel?.sourcePath) ??
      this.optionalString(sourceLabel?.code) ??
      this.optionalString(evidence[0]?.sourceType) ??
      'unknown'
    );
  }

  private inferTriggerType(
    labels: Awaited<ReturnType<EventLabelingService['buildLabels']>>,
    decision: OpportunityMiningDecision,
  ): string {
    return (
      this.optionalString(labels.find((label) => label.category === 'trigger')?.code) ??
      decision.opportunityType
    );
  }

  private inferTriggerRuleCode(
    labels: Awaited<ReturnType<EventLabelingService['buildLabels']>>,
  ): string {
    return (
      this.optionalString(labels.find((label) => label.category === 'trigger')?.code) ??
      'agent_decision'
    );
  }

  private buildEventIdentity(
    decision: OpportunityMiningDecision,
    evidence: EvidenceItem[],
  ): EventIdentity {
    const metadataIdentity = decision.metadata?.identity;
    if (this.isEventIdentity(metadataIdentity)) {
      return metadataIdentity;
    }

    return {
      subject: this.extractSubject(decision.title),
      action: 'unknown',
      object: decision.title,
      time: {
        exactAt: evidence[0]?.observedAt?.toISOString() ?? new Date().toISOString(),
      },
      state: 'unknown',
      coreFact: decision.summary,
    };
  }

  private extractSubject(title: string): string {
    const subject = title.split(/[：:·|-]/)[0]?.trim();
    return subject || title;
  }

  private isEventIdentity(value: unknown): value is EventIdentity {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const identity = value as Partial<EventIdentity>;
    return Boolean(
      identity.subject &&
        identity.action &&
        identity.object &&
        identity.time &&
        identity.state &&
        identity.coreFact,
    );
  }

  private async recordMiningRun(input: {
    seedSignalId?: string;
    idempotencyKey?: string;
    agentRunId?: string;
    decision: OpportunityMiningDecision;
    target?: {
      type: 'opportunity' | 'event';
      id: string;
    };
  }) {
    if (!input.seedSignalId || !input.idempotencyKey) {
      return;
    }

    await this.opportunityRepository.createMiningSignalRun({
      signalId: input.seedSignalId,
      agentRunId: input.agentRunId,
      status: 'succeeded',
      decision: input.decision.decision,
      targetType: input.target?.type,
      targetId: input.target?.id,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
}
