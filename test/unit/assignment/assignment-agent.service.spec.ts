import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { DomainError } from '../../../src/common/errors/domain-error';
import { AccountProvider } from '../../../src/assignment/account-provider/account-provider.interface';
import { AssignmentRepository } from '../../../src/assignment/assignment.repository';
import { AssignmentAgentService } from '../../../src/assignment/decision/assignment-agent.service';
import { OperatingAccount } from '../../../src/assignment/assignment.types';
import { LocalAccountProviderService } from '../../../src/assignment/account-provider/local-account-provider.service';

describe('AssignmentAgentService', () => {
  it('creates assignment suggestions for available accounts', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            targetType: 'opportunity',
            targetId: 'opp_1',
            decision: 'assign',
            summary: '适合两个账号承接。',
            assignments: [
              {
                accountId: 'acct_flash',
                accountName: '快讯账号',
                accountSource: 'local',
                priority: 'high',
                contentType: 'short_post',
                contentGoal: '快速说明发生了什么。',
                angle: '快讯角度',
                constraints: ['引用证据'],
                reason: '适合快速响应。',
                evidenceRefs: ['ev_1'],
                duplicateRisk: 'low',
              },
              {
                accountId: 'acct_analysis',
                accountName: '分析账号',
                accountSource: 'local',
                priority: 'medium',
                contentType: 'thread',
                contentGoal: '解释行业影响。',
                angle: '行业分析角度',
                constraints: ['区分事实和观点'],
                reason: '适合解释复杂背景。',
                evidenceRefs: ['ev_1'],
                duplicateRisk: 'none',
              },
            ],
            skippedAccounts: [],
            riskNotes: [],
            missingData: [],
            confidence: 'medium',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const accountProvider = new LocalAccountProviderService([
      createAccount('acct_flash', 'available'),
      createAccount('acct_analysis', 'available'),
      createAccount('acct_paused', 'paused'),
    ]);
    const repository = createRepository();
    const service = new AssignmentAgentService(
      workflowEngine,
      accountProvider,
      repository,
    );

    const result = await service.assign({
      targetType: 'opportunity',
      targetId: 'opp_1',
      targetContext: {
        title: 'OpenAI 新模型发布',
      },
      topics: ['ai'],
      platforms: ['x'],
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'assignment',
      }),
    );
    const goal = (workflowEngine.run as jest.Mock).mock.calls[0][0].goal;
    expect(goal.accounts.map((account: OperatingAccount) => account.id)).toEqual(
      ['acct_flash', 'acct_analysis'],
    );
    expect(repository.createSuggestedItem).toHaveBeenCalledTimes(2);
    expect(result.assignments).toHaveLength(2);
  });

  it('rejects duplicated assignment angles', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            targetType: 'opportunity',
            targetId: 'opp_1',
            decision: 'assign',
            summary: '重复角度。',
            assignments: [
              {
                accountId: 'acct_flash',
                accountName: '快讯账号',
                accountSource: 'local',
                priority: 'high',
                contentType: 'short_post',
                contentGoal: '快速说明发生了什么。',
                angle: '同一个角度',
                constraints: [],
                reason: '适合快速响应。',
                evidenceRefs: ['ev_1'],
                duplicateRisk: 'low',
              },
              {
                accountId: 'acct_analysis',
                accountName: '分析账号',
                accountSource: 'local',
                priority: 'medium',
                contentType: 'thread',
                contentGoal: '解释行业影响。',
                angle: '同一个角度',
                constraints: [],
                reason: '适合解释复杂背景。',
                evidenceRefs: ['ev_1'],
                duplicateRisk: 'none',
              },
            ],
            skippedAccounts: [],
            riskNotes: [],
            missingData: [],
            confidence: 'medium',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new AssignmentAgentService(
      workflowEngine,
      new LocalAccountProviderService([createAccount('acct_flash', 'available')]),
      createRepository(),
    );

    await expect(
      service.assign({
        targetType: 'opportunity',
        targetId: 'opp_1',
        targetContext: {
          title: 'OpenAI 新模型发布',
        },
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'ASSIGNMENT_DUPLICATED_ANGLE',
      }),
    );
  });
});

function createAccount(
  id: string,
  workloadStatus: OperatingAccount['workloadStatus'],
): OperatingAccount {
  return {
    id,
    source: 'local',
    displayName: id,
    platform: 'x',
    persona: 'AI 运营账号',
    contentRules: '基于证据表达。',
    preferredTopics: ['ai'],
    forbiddenTopics: [],
    supportedContentTypes: ['short_post', 'thread'],
    workloadStatus,
  };
}

function createRepository(): AssignmentRepository {
  return {
    createRun: jest.fn(() =>
      Promise.resolve({
        id: 'arun_1',
        targetType: 'opportunity',
        targetId: 'opp_1',
        status: 'running',
        goal: {},
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    ),
    finishRun: jest.fn((input) =>
      Promise.resolve({
        id: input.runId,
        targetType: 'opportunity',
        targetId: 'opp_1',
        status: 'succeeded',
        goal: {},
        decision: input.decision,
        confidence: input.decision.confidence,
        riskNotes: input.decision.riskNotes,
        missingData: input.decision.missingData,
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    ),
    createSuggestedItem: jest.fn((input) =>
      Promise.resolve({
        id: `aitem_${input.assignment.accountId}`,
        runId: input.runId,
        targetType: input.targetType,
        targetId: input.targetId,
        accountId: input.assignment.accountId,
        accountSource: input.assignment.accountSource,
        priority: input.assignment.priority,
        contentType: input.assignment.contentType,
        contentGoal: input.assignment.contentGoal,
        angle: input.assignment.angle,
        constraints: input.assignment.constraints,
        reason: input.assignment.reason,
        evidenceRefs: input.assignment.evidenceRefs,
        duplicateRisk: input.assignment.duplicateRisk,
        status: 'suggested',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    ),
  } as unknown as AssignmentRepository;
}
