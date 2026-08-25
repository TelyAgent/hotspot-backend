import { OpportunityMiningOrchestratorService } from '../../../src/opportunity/mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSignalSelectorService } from '../../../src/opportunity/mining/opportunity-mining-signal-selector.service';
import { OpportunityRepository } from '../../../src/opportunity/opportunity.repository';
import { OpportunityRulePackGovernanceService } from '../../../src/opportunity/rule-pack/opportunity-rule-pack-governance.service';
import { OpportunityRulePackLoaderService } from '../../../src/opportunity/rule-pack/opportunity-rule-pack-loader.service';
import { MockModelProvider } from '../../../src/agent/model-provider/mock-model-provider';

describe('OpportunityRulePackGovernanceService', () => {
  it('selects a recent signal for rule pack test run when signalId is omitted', async () => {
    const { service, orchestrator, selector } = createService();

    const result = await service.testRun({});

    expect(selector.select).toHaveBeenCalledWith({
      now: expect.any(Date),
      take: 1,
    });
    expect(orchestrator.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        seedSignalIds: ['sig_auto'],
        writeMode: 'suggest_only',
      }),
    );
    expect(result).toEqual({
      status: 'passed',
      result: expect.objectContaining({
        result: expect.objectContaining({
          decision: 'ignore',
        }),
      }),
    });
  });

  it('asks the model to rewrite one rule document and returns suggestions', async () => {
    const { service, modelProvider } = createService({
      modelProvider: new MockModelProvider([
        {
          type: 'final_decision',
          decision: {
            markdown: '# 修改后的规则',
            changeSummary: '降低娱乐话题误触发。',
            suggestions: ['启用前观察热搜误报率。'],
          },
        },
      ]),
    });

    const result = await service.createAiDraft({
      documentId: 'x-trend-rules',
      instruction: '让热搜触发更严格',
    });

    expect(result).toEqual({
      document: expect.objectContaining({
        id: 'x-trend-rules',
        markdown: '# 修改后的规则',
      }),
      changeSummary: '降低娱乐话题误触发。',
      suggestions: ['启用前观察热搜误报率。'],
    });
    expect(modelProvider.inputs[0]).toEqual(
      expect.objectContaining({
        agentType: 'opportunity_rule_pack_editor',
        goal: expect.objectContaining({
          documentId: 'x-trend-rules',
          instruction: '让热搜触发更严格',
        }),
      }),
    );
  });

  it('accepts model output when markdown is nested under document', async () => {
    const { service } = createService({
      modelProvider: new MockModelProvider([
        {
          type: 'final_decision',
          decision: {
            document: {
              markdown: '# 嵌套返回的规则',
            },
            changeSummary: '按要求修改。',
            suggestions: [],
          },
        },
      ]),
    });

    const result = await service.createAiDraft({
      documentId: 'x-trend-rules',
      instruction: '修改规则',
    });

    expect(result.document.markdown).toBe('# 嵌套返回的规则');
  });
});

function createService(input?: {
  modelProvider?: MockModelProvider;
}) {
  const repository = {
    findLatestRulePackVersion: jest.fn(() => Promise.resolve(1)),
    createRulePack: jest.fn((rulePack) =>
      Promise.resolve({
        id: 'rule_pack_draft',
        ...rulePack,
      }),
    ),
    findRulePackById: jest.fn(),
  } as unknown as jest.Mocked<OpportunityRepository>;
  const loader = {
    loadActiveRulePack: jest.fn(() =>
      Promise.resolve({
        id: 'rule_pack_1',
        version: 1,
        status: 'active',
        basePath: '/rules',
        documents: [
          {
            id: 'x-trend-rules',
            title: 'X 热搜挖掘规则',
            path: '/rules/x-trend-rules.md',
            markdown: '# 原始规则',
          },
        ],
        routes: [],
      }),
    ),
  } as unknown as jest.Mocked<OpportunityRulePackLoaderService>;
  const orchestrator = {
    createGoal: jest.fn((goal) => ({
      id: 'goal_1',
      ...goal,
    })),
    run: jest.fn(() =>
      Promise.resolve({
        runId: 'run_1',
        status: 'succeeded',
        result: {
          decision: 'ignore',
        },
      }),
    ),
  } as unknown as jest.Mocked<OpportunityMiningOrchestratorService>;
  const selector = {
    select: jest.fn(() =>
      Promise.resolve([
        {
          id: 'sig_auto',
          title: 'OpenAI',
          signalType: 'x_trend',
          source: 'x',
          observedAt: new Date('2026-08-25T08:00:00.000Z'),
          raw: {},
          metadata: {},
          createdAt: new Date('2026-08-25T08:00:00.000Z'),
          updatedAt: new Date('2026-08-25T08:00:00.000Z'),
        },
      ]),
    ),
  } as unknown as jest.Mocked<OpportunityMiningSignalSelectorService>;
  const modelProvider =
    input?.modelProvider ??
    new MockModelProvider([
      {
        type: 'final_decision',
        decision: {
          markdown: '# 修改后的规则',
          changeSummary: '更新规则。',
          suggestions: [],
        },
      },
    ]);

  const service = new OpportunityRulePackGovernanceService(
    repository,
    loader,
    orchestrator,
    selector,
    modelProvider,
  );

  return {
    service,
    repository,
    loader,
    orchestrator,
    selector,
    modelProvider,
  };
}
