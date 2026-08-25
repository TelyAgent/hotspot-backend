import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { AccountProvider } from '../account-provider/account-provider.interface';
import { ACCOUNT_PROVIDER } from '../assignment.tokens';
import { AssignmentRepository } from '../assignment.repository';
import { AssignmentDecision } from '../assignment.types';

@Injectable()
export class AssignmentAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    @Inject(ACCOUNT_PROVIDER)
    private readonly accountProvider: AccountProvider,
    private readonly assignmentRepository: AssignmentRepository,
  ) {}

  async assign(input: {
    targetType: AssignmentDecision['targetType'];
    targetId: string;
    targetContext: JsonObject;
    topics?: string[];
    platforms?: string[];
  }): Promise<AssignmentDecision> {
    const accounts = await this.accountProvider.listAccounts({
      topics: input.topics,
      platforms: input.platforms,
    });
    const serializedAccounts = accounts.map((account) => ({
      id: account.id,
      source: account.source,
      sourceSystem: account.sourceSystem ?? null,
      displayName: account.displayName,
      platform: account.platform,
      handle: account.handle ?? null,
      persona: account.persona,
      contentRules: account.contentRules,
      generationPrompt: account.generationPrompt ?? null,
      preferredTopics: account.preferredTopics,
      forbiddenTopics: account.forbiddenTopics,
      supportedContentTypes: account.supportedContentTypes,
      workloadStatus: account.workloadStatus,
      dailyTaskLimit: account.dailyTaskLimit ?? null,
      recentTaskCount: account.recentTaskCount ?? null,
      metadata: account.metadata ?? null,
    }));
    const run = await this.assignmentRepository.createRun({
      targetType: input.targetType,
      targetId: input.targetId,
      goal: {
        targetContext: input.targetContext,
        accounts: serializedAccounts,
      },
      startedAt: new Date(),
    });

    const result = await this.workflowEngine.run({
      agentType: 'assignment',
      goal: {
        targetType: input.targetType,
        targetId: input.targetId,
        targetContext: input.targetContext,
        accounts: serializedAccounts,
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Assignment agent failed.',
        'ASSIGNMENT_AGENT_FAILED',
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);
    this.validateAngles(decision);

    await this.assignmentRepository.finishRun({
      runId: run.id,
      decision,
      finishedAt: new Date(),
    });

    for (const assignment of decision.assignments) {
      await this.assignmentRepository.createSuggestedItem({
        runId: run.id,
        targetType: input.targetType,
        targetId: input.targetId,
        assignment,
      });
    }

    return decision;
  }

  private parseDecision(value: JsonObject): AssignmentDecision {
    const required = [
      'targetType',
      'targetId',
      'decision',
      'assignments',
      'skippedAccounts',
      'summary',
      'riskNotes',
      'missingData',
      'confidence',
    ];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Assignment decision missing field: ${key}`,
          'ASSIGNMENT_DECISION_INVALID',
          { field: key },
        );
      }
    }

    return value as unknown as AssignmentDecision;
  }

  private validateAngles(decision: AssignmentDecision): void {
    const angles = decision.assignments.map((assignment) =>
      assignment.angle.trim(),
    );
    const uniqueAngles = new Set(angles);

    if (angles.length !== uniqueAngles.size) {
      throw new DomainError(
        'Assignments for multiple accounts must use different angles.',
        'ASSIGNMENT_DUPLICATED_ANGLE',
      );
    }
  }
}
