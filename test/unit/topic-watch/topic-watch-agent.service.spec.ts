import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { TopicWatchAgentService } from '../../../src/topic-watch/decision/topic-watch-agent.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';
import {
  TopicCandidate,
  TopicWatch,
} from '../../../src/topic-watch/topic-watch.types';

describe('TopicWatchAgentService', () => {
  it('creates a topic watch decision from candidate topics', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: 'create_opportunity',
            title: 'OpenAI 新模型发布出现集中讨论',
            summary: '多个账号围绕 OpenAI 新模型发布讨论。',
            matchedRules: ['官方发布 + 开发者讨论'],
            evidenceRefs: ['ev_1'],
            missingData: [],
            riskNotes: ['需要确认官方详情。'],
            confidence: 'medium',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const repository = {
      createDecision: jest.fn((input) =>
        Promise.resolve({
          id: 'decision_1',
          ...input,
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
    } as unknown as TopicWatchRepository;
    const service = new TopicWatchAgentService(workflowEngine, repository);

    const result = await service.evaluate({
      topicWatch: createTopicWatch(),
      candidates: [createCandidate()],
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'topic_watch',
        maxSteps: 5,
      }),
    );
    expect(repository.createDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'tw_1',
        decision: 'create_opportunity',
        evidenceRefs: ['ev_1'],
        confidence: 'medium',
      }),
    );
    expect(result.decision).toBe('create_opportunity');
  });

  it('generates a draft monitoring plan from topic watch policies', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_plan_1',
          status: 'succeeded',
          result: {
            sources: [
              {
                platform: 'x',
                sourceType: 'account',
                handle: 'OpenAI',
                includeReplies: true,
                includeQuotes: true,
                includeReposts: false,
                maxPages: 5,
              },
            ],
            triggerRules: [
              {
                ruleId: 'multi-account-discussion',
                description: '多账号集中讨论时触发。',
                conditionText: '多个核心账号在短时间讨论同一事件。',
              },
            ],
            evidenceRequirements: [
              {
                sourceType: 'x_account_post',
                requiredFields: ['url', 'text', 'publishedAt', 'metrics'],
              },
            ],
            refreshPolicy: {
              intervalMinutes: 180,
              lookbackMinutes: 180,
            },
            reason: '根据主题策略生成 X 账号监控计划。',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const repository = {
      findLatestMonitoringPlan: jest.fn(() =>
        Promise.resolve({
          id: 'plan_old',
          version: 1,
          status: 'active',
        }),
      ),
      createMonitoringPlan: jest.fn((input) =>
        Promise.resolve({
          id: 'plan_2',
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
          ...input,
        }),
      ),
    } as unknown as TopicWatchRepository;
    const service = new TopicWatchAgentService(workflowEngine, repository);

    const result = await service.generateMonitoringPlan({
      topicWatch: createTopicWatch(),
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'topic_watch_monitoring_plan',
        maxSteps: 5,
        goal: expect.objectContaining({
          nextVersion: 2,
        }),
      }),
    );
    expect(repository.createMonitoringPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'tw_1',
        version: 2,
        generatedBy: 'agent',
        status: 'draft',
      }),
    );
    expect(result.id).toBe('plan_2');
  });

  it('activates generated monitoring plan when requested', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_plan_1',
          status: 'succeeded',
          result: {
            sources: [],
            triggerRules: [],
            evidenceRequirements: [],
            refreshPolicy: {
              intervalMinutes: 180,
              lookbackMinutes: 180,
            },
            reason: '先生成空计划等待人工补充账号。',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const repository = {
      findLatestMonitoringPlan: jest.fn(() => Promise.resolve(null)),
      createMonitoringPlan: jest.fn((input) =>
        Promise.resolve({
          id: 'plan_1',
          ...input,
        }),
      ),
      activateMonitoringPlan: jest.fn((topicWatchId, planId) =>
        Promise.resolve({
          id: planId,
          topicWatchId,
          version: 1,
          status: 'active',
        }),
      ),
    } as unknown as TopicWatchRepository;
    const service = new TopicWatchAgentService(workflowEngine, repository);

    const result = await service.generateMonitoringPlan({
      topicWatch: createTopicWatch(),
      activate: true,
    });

    expect(repository.activateMonitoringPlan).toHaveBeenCalledWith(
      'tw_1',
      'plan_1',
    );
    expect(result.status).toBe('active');
  });
});

function createTopicWatch(): TopicWatch {
  return {
    id: 'tw_1',
    name: 'AI 产品发布',
    description: '追踪 AI 产品发布',
    domains: ['ai'],
    watchIntent: '发现 AI 产品发布机会。',
    collectionPolicy: '监控 AI 公司官方账号。',
    triggerPolicy: '官方发布且开发者讨论集中。',
    evidencePolicy: '必须包含一手来源。',
    exclusionPolicy: null,
    status: 'active',
    ownerId: null,
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
  };
}

function createCandidate(): TopicCandidate {
  return {
    id: 'tc_1',
    topicWatchId: 'tw_1',
    title: 'OpenAI 新模型发布',
    summary: '多个账号讨论 OpenAI 新模型。',
    keywords: ['model', 'release'],
    entities: ['OpenAI'],
    firstSeenAt: new Date('2026-08-24T10:00:00.000Z'),
    lastSeenAt: new Date('2026-08-24T10:30:00.000Z'),
    signalCount: 2,
    postCount: 2,
    accountCount: 2,
    sourceTypes: ['post'],
    representativeSignalIds: ['sig_1', 'sig_2'],
    evidenceRefs: ['ev_1'],
    metrics: {
      uniqueAuthors: 2,
      totalSignals: 2,
    },
    clustering: {
      method: 'hybrid',
      confidence: 'medium',
    },
    status: 'new',
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
  };
}
