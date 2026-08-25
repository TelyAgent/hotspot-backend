import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { TopicWatchRepository } from '../topic-watch.repository';
import {
  TopicCandidate,
  TopicMonitoringPlan,
  TopicWatch,
  TopicWatchDecision,
} from '../topic-watch.types';

@Injectable()
export class TopicWatchAgentService {
  constructor(
    @Inject(AGENT_WORKFLOW_ENGINE)
    private readonly workflowEngine: AgentWorkflowEngine,
    private readonly topicWatchRepository: TopicWatchRepository,
  ) {}

  async evaluate(input: {
    topicWatch: TopicWatch;
    candidates: TopicCandidate[];
  }): Promise<TopicWatchDecision> {
    const result = await this.workflowEngine.run({
      agentType: 'topic_watch',
      goal: {
        topicWatch: this.serializeTopicWatch(input.topicWatch),
        candidates: input.candidates.map((candidate) =>
          this.serializeCandidate(candidate),
        ),
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Topic watch agent failed.',
        'TOPIC_WATCH_AGENT_FAILED',
      );
    }

    const decision = this.parseDecision(result.result as JsonObject);
    return this.topicWatchRepository.createDecision({
      topicWatchId: input.topicWatch.id,
      ...decision,
    });
  }

  async generateMonitoringPlan(input: {
    topicWatch: TopicWatch;
    activate?: boolean;
  }): Promise<TopicMonitoringPlan> {
    const latestPlan = await this.topicWatchRepository.findLatestMonitoringPlan(
      input.topicWatch.id,
    );
    const nextVersion = (latestPlan?.version ?? 0) + 1;
    const result = await this.workflowEngine.run({
      agentType: 'topic_watch_monitoring_plan',
      goal: {
        topicWatch: this.serializeTopicWatch(input.topicWatch),
        previousPlan: latestPlan ? this.serializeMonitoringPlan(latestPlan) : null,
        nextVersion,
      },
      maxSteps: 5,
    });

    if (result.status !== 'succeeded' || !result.result) {
      throw new DomainError(
        result.errorMessage ?? 'Topic watch monitoring plan agent failed.',
        'TOPIC_WATCH_MONITORING_PLAN_AGENT_FAILED',
      );
    }

    const plan = this.parseMonitoringPlan(result.result as JsonObject);
    const created = await this.topicWatchRepository.createMonitoringPlan({
      topicWatchId: input.topicWatch.id,
      version: nextVersion,
      sources: plan.sources,
      triggerRules: plan.triggerRules,
      evidenceRequirements: plan.evidenceRequirements,
      refreshPolicy: plan.refreshPolicy,
      generatedBy: 'agent',
      reason: plan.reason,
      status: 'draft',
    });

    if (input.activate) {
      return this.topicWatchRepository.activateMonitoringPlan(
        input.topicWatch.id,
        created.id,
      );
    }

    return created as TopicMonitoringPlan;
  }

  private serializeTopicWatch(topicWatch: TopicWatch): JsonObject {
    return {
      id: topicWatch.id,
      name: topicWatch.name,
      watchIntent: topicWatch.watchIntent,
      collectionPolicy: topicWatch.collectionPolicy,
      triggerPolicy: topicWatch.triggerPolicy,
      evidencePolicy: topicWatch.evidencePolicy,
      exclusionPolicy: topicWatch.exclusionPolicy ?? null,
    };
  }

  private serializeCandidate(candidate: TopicCandidate): JsonObject {
    return {
      id: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      signalCount: candidate.signalCount,
      postCount: candidate.postCount ?? null,
      accountCount: candidate.accountCount ?? null,
      sourceTypes: candidate.sourceTypes,
      representativeSignalIds: candidate.representativeSignalIds,
      evidenceRefs: candidate.evidenceRefs,
      metrics: candidate.metrics,
    };
  }

  private serializeMonitoringPlan(plan: TopicMonitoringPlan): JsonObject {
    return {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      sources: plan.sources,
      triggerRules: plan.triggerRules,
      evidenceRequirements: plan.evidenceRequirements,
      refreshPolicy: plan.refreshPolicy,
      generatedBy: plan.generatedBy,
      reason: plan.reason,
    };
  }

  private parseDecision(value: JsonObject): Omit<TopicWatchDecision, 'id' | 'topicWatchId' | 'createdAt'> {
    const required = [
      'decision',
      'summary',
      'matchedRules',
      'evidenceRefs',
      'missingData',
      'riskNotes',
      'confidence',
    ];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Topic watch decision missing field: ${key}`,
          'TOPIC_WATCH_DECISION_INVALID',
          { field: key },
        );
      }
    }

    return value as unknown as Omit<TopicWatchDecision, 'id' | 'topicWatchId' | 'createdAt'>;
  }

  private parseMonitoringPlan(value: JsonObject): Pick<
    TopicMonitoringPlan,
    | 'sources'
    | 'triggerRules'
    | 'evidenceRequirements'
    | 'refreshPolicy'
    | 'reason'
  > {
    const required = [
      'sources',
      'triggerRules',
      'evidenceRequirements',
      'refreshPolicy',
      'reason',
    ];

    for (const key of required) {
      if (!(key in value)) {
        throw new DomainError(
          `Topic watch monitoring plan missing field: ${key}`,
          'TOPIC_WATCH_MONITORING_PLAN_INVALID',
          { field: key },
        );
      }
    }

    if (
      !Array.isArray(value.sources) ||
      !Array.isArray(value.triggerRules) ||
      !Array.isArray(value.evidenceRequirements) ||
      !this.isJsonObject(value.refreshPolicy) ||
      typeof value.reason !== 'string'
    ) {
      throw new DomainError(
        'Topic watch monitoring plan has invalid field shape.',
        'TOPIC_WATCH_MONITORING_PLAN_INVALID',
      );
    }

    return {
      sources: value.sources.filter(this.isJsonObject),
      triggerRules: value.triggerRules.filter(this.isJsonObject),
      evidenceRequirements: value.evidenceRequirements.filter(this.isJsonObject),
      refreshPolicy: value.refreshPolicy,
      reason: value.reason,
    };
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
