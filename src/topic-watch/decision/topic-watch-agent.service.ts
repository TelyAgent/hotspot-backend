import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { AGENT_WORKFLOW_ENGINE } from '../../agent/agent.tokens';
import { AgentWorkflowEngine } from '../../agent/workflow-engine/agent-workflow-engine.interface';
import { TopicWatchRepository } from '../topic-watch.repository';
import {
  TopicCandidate,
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
}
