import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import {
  ContentDraft,
  ContentGenerationDecision,
  ContentGenerationInput,
} from '../content.types';
import { ContentDraftRepository } from '../draft/content-draft.repository';

@Injectable()
export class ContentGenerationAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly contentDraftRepository: ContentDraftRepository,
  ) {}

  async generate(input: ContentGenerationInput): Promise<ContentDraft> {
    if (input.evidence.length === 0) {
      throw new DomainError(
        'Content generation requires evidence.',
        'CONTENT_GENERATION_EVIDENCE_REQUIRED',
      );
    }

    const generationInput = this.createGenerationInput(input);
    const result = await this.workflowEngine.run({
      agentType: 'content_generation',
      goal: generationInput,
      maxSteps: 4,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Content generation agent failed.',
        'CONTENT_GENERATION_AGENT_FAILED',
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);
    const version = await this.contentDraftRepository.getNextVersion(
      input.contentTask.id,
    );

    return this.contentDraftRepository.create({
      contentTaskId: input.contentTask.id,
      version,
      body: decision.body,
      evidenceRefs: decision.evidenceRefs,
      generationInput,
      userInstruction: input.userInstruction ?? null,
      status: 'draft',
    });
  }

  private createGenerationInput(input: ContentGenerationInput): JsonObject {
    return {
      contentTask: {
        id: input.contentTask.id,
        targetType: input.contentTask.targetType,
        targetId: input.contentTask.targetId,
        accountId: input.contentTask.accountId,
        contentType: input.contentTask.contentType,
        contentGoal: input.contentTask.contentGoal,
        angle: input.contentTask.angle,
        constraints: input.contentTask.constraints,
        evidenceRefs: input.contentTask.evidenceRefs,
      },
      accountPersona: input.accountPersona,
      contentRules: input.contentRules,
      generationPrompt: input.generationPrompt ?? null,
      evidence: input.evidence.map((item) => ({
        id: item.id,
        claim: item.claim,
        text: item.text ?? null,
        url: item.url ?? null,
        confidence: item.confidence,
      })),
      userInstruction: input.userInstruction ?? null,
    };
  }

  private parseDecision(value: JsonObject): ContentGenerationDecision {
    const required = ['body', 'evidenceRefs', 'riskNotes'];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Content generation decision missing field: ${key}`,
          'CONTENT_GENERATION_DECISION_INVALID',
          { field: key },
        );
      }
    }

    return value as unknown as ContentGenerationDecision;
  }
}
