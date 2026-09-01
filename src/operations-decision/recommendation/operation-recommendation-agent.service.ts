import { Inject, Injectable } from '@nestjs/common';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { JsonObject } from '../../common/types/json.type';
import { OperationRecommendationDecision } from '../operations-decision.types';

@Injectable()
export class OperationRecommendationAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly agentWorkflowEngine: AgentWorkflowEngine,
  ) {}

  async decide(input: {
    event: JsonObject;
    predxNews: JsonObject[];
    productReference: string;
  }): Promise<{
    decision?: OperationRecommendationDecision;
    agentRunId?: string;
    skipped?: boolean;
  }> {
    const result = await this.agentWorkflowEngine.run({
      agentType: 'operations_decision',
      maxSteps: 3,
      goal: {
        instruction:
          '根据事件上下文、PredX 最新新闻/市场数据和产品承接规则，判断是否生成运营选题推荐。',
        event: input.event,
        predxNews: input.predxNews,
        productReference: input.productReference,
      },
    });

    if (result.status !== 'succeeded' || !result.result) {
      return { agentRunId: result.runId };
    }

    const parsed = normalizeDecision(result.result as JsonObject);
    return {
      decision: parsed.decision,
      agentRunId: result.runId,
      skipped: parsed.skipped,
    };
  }
}

function normalizeDecision(value: JsonObject): {
  decision?: OperationRecommendationDecision;
  skipped?: boolean;
} {
  if (value.status === 'none') return { skipped: true };
  if (typeof value.title !== 'string' || typeof value.summary !== 'string') {
    return {};
  }

  const predxOpportunity = isJsonObject(value.predxOpportunity)
    ? value.predxOpportunity
    : {};

  return {
    decision: {
    title: value.title,
    summary: value.summary,
    recommendationLabels: readStringArray(value.recommendationLabels),
    basis: readBasis(value.basis),
    priority: value.priority === 'immediate' ? 'immediate' : 'today',
    reason: readString(value.reason) ?? '事件与 PredX 产品承接存在关联。',
    predxOpportunity: {
      status: predxOpportunity.status === 'none' ? 'none' : 'supported',
      associationLevel: readAssociationLevel(predxOpportunity.associationLevel),
      rationale: readString(predxOpportunity.rationale) ?? '',
      selectedProductValue: readString(predxOpportunity.selectedProductValue) ?? '',
      recommendedProductPage: readProductPage(predxOpportunity.recommendedProductPage),
      recommendedProductUrl:
        readString(predxOpportunity.recommendedProductUrl) ?? 'https://predx.pro/home',
      urlReason: readString(predxOpportunity.urlReason) ?? '',
    },
    angles: Array.isArray(value.angles)
      ? value.angles.filter(isJsonObject).map((angle) => ({
          level: readString(angle.level) ?? 'L3_thematic',
          claim: readString(angle.claim) ?? '',
          targetUser: readString(angle.targetUser),
          userValue: readString(angle.userValue),
          evidence: readStringArray(angle.evidence),
          productUrl: readString(angle.productUrl),
          riskNotes: readStringArray(angle.riskNotes),
        })).filter((angle) => angle.claim)
      : [],
    evidenceRefs: readStringArray(value.evidenceRefs),
    missingData: readStringArray(value.missingData),
    riskNotes: readStringArray(value.riskNotes),
    confidence: value.confidence === 'high' || value.confidence === 'low' ? value.confidence : 'medium',
    },
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBasis(value: unknown): OperationRecommendationDecision['basis'] {
  return value === 'heat' || value === 'product' ? value : 'market';
}

function readAssociationLevel(value: unknown): OperationRecommendationDecision['predxOpportunity']['associationLevel'] {
  const allowed = new Set(['L1_direct', 'L2_analogous', 'L3_thematic', 'L4_conceptual', 'none']);
  return typeof value === 'string' && allowed.has(value) ? value as never : 'L3_thematic';
}

function readProductPage(value: unknown): OperationRecommendationDecision['predxOpportunity']['recommendedProductPage'] {
  return value === 'news' || value === 'market' || value === 'signal' ? value : 'home';
}
