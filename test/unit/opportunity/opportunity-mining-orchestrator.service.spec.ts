import { OpportunityMiningDecisionValidator } from '../../../src/opportunity/mining/opportunity-mining-decision.validator';
import { OpportunityMiningOrchestratorService } from '../../../src/opportunity/mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningAgentService } from '../../../src/opportunity/mining/opportunity-mining-agent.service';
import { OpportunityMiningEvidenceService } from '../../../src/opportunity/mining/opportunity-mining-evidence.service';
import { OpportunityRepository } from '../../../src/opportunity/opportunity.repository';
import { OpportunityRulePackLoaderService } from '../../../src/opportunity/rule-pack/opportunity-rule-pack-loader.service';
import { EventLabelingService } from '../../../src/opportunity/labeling/event-labeling.service';
import { EventMergeRepository } from '../../../src/event-merge/event-merge.repository';
import { EventMergeOrchestratorService } from '../../../src/event-merge/event-merge-orchestrator.service';

describe('OpportunityMiningOrchestratorService', () => {
  it('passes selected rule documents to the mining agent in suggest_only mode', async () => {
    const evidenceService = {
      load: jest.fn(() =>
        Promise.resolve({
          signals: [
            {
              id: 'sig_1',
              signalType: 'x_trend',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ],
          evidence: [],
          missingData: [],
        }),
      ),
    } as unknown as OpportunityMiningEvidenceService;
    const rulePackLoader = {
      loadActiveRulePack: jest.fn(() =>
        Promise.resolve({
          id: 'rule_pack_1',
          version: 1,
          status: 'active',
          basePath: '/tmp/rules',
          documents: [
            {
              id: 'x-trend-rules',
              title: 'X 热搜挖掘规则',
              path: '/tmp/rules/x-trend-rules.md',
              markdown: '# X 热搜挖掘规则',
            },
          ],
          routes: [],
        }),
      ),
      selectDocuments: jest.fn(() => [
        {
          id: 'x-trend-rules',
          title: 'X 热搜挖掘规则',
          path: '/tmp/rules/x-trend-rules.md',
          markdown: '# X 热搜挖掘规则',
        },
      ]),
    } as unknown as OpportunityRulePackLoaderService;
    const miningAgentService = {
      evaluateGoalWithRun: jest.fn(() =>
        Promise.resolve({
          agentRunId: 'agent_run_1',
          decision: {
            decision: 'create_insight',
            title: '热搜洞察',
            opportunityType: 'industry_topic',
            summary: '出现值得观察的热搜。',
            whyNow: '正在讨论。',
            whyItMatters: '可能影响运营选题。',
            productAngles: ['热点监控'],
            contentWindow: '24 小时',
            confidence: 'medium',
            evidenceRefs: [],
            missingData: [],
            riskNotes: [],
          },
        }),
      ),
    } as unknown as OpportunityMiningAgentService;
    const opportunityRepository = {
      createOpportunity: jest.fn(),
      createEvent: jest.fn(),
      createMiningSignalRun: jest.fn(() => Promise.resolve({})),
    } as unknown as OpportunityRepository;
    const eventLabelingService = {
      buildLabels: jest.fn(() => Promise.resolve([])),
    } as unknown as EventLabelingService;
    const eventMergeRepository = {
      createSourceContext: jest.fn(),
    } as unknown as EventMergeRepository;
    const eventMergeOrchestrator = {
      processIncomingContext: jest.fn(),
    } as unknown as EventMergeOrchestratorService;
    const service = new OpportunityMiningOrchestratorService(
      evidenceService,
      rulePackLoader,
      miningAgentService,
      new OpportunityMiningDecisionValidator(),
      opportunityRepository,
      eventLabelingService,
      eventMergeRepository,
      eventMergeOrchestrator,
    );

    const result = await service.run({
      goal: service.createGoal({
        instruction: '判断是否形成机会。',
        seedSignalIds: ['sig_1'],
      }),
    });

    expect(result.decision.decision).toBe('create_insight');
    expect(rulePackLoader.selectDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        signalType: 'x_trend',
      }),
    );
    expect(miningAgentService.evaluateGoalWithRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleDocuments: [
          expect.objectContaining({
            id: 'x-trend-rules',
          }),
        ],
      }),
      expect.objectContaining({
        signals: [
          expect.objectContaining({
            id: 'sig_1',
          }),
        ],
      }),
    );
    expect(opportunityRepository.createOpportunity).not.toHaveBeenCalled();
    expect(opportunityRepository.createEvent).not.toHaveBeenCalled();
  });

  it('normalizes event evidence references to real evidence ids before persisting', async () => {
    const evidenceService = {
      load: jest.fn(() =>
        Promise.resolve({
          signals: [
            {
              id: 'sig_1',
              signalType: 'x_trend',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ],
          evidence: [
            {
              id: 'evi_1',
              signalId: 'sig_1',
              sourceType: 'x_trend',
              claim: '热搜进入前十',
              url: 'https://x.com/search?q=test',
              confidence: 'high',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
              createdAt: new Date('2026-08-24T10:00:00.000Z'),
              updatedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ],
          missingData: [],
        }),
      ),
    } as unknown as OpportunityMiningEvidenceService;
    const rulePackLoader = {
      loadActiveRulePack: jest.fn(() =>
        Promise.resolve({
          id: 'rule_pack_1',
          version: 1,
          status: 'active',
          basePath: '/tmp/rules',
          documents: [],
          routes: [],
        }),
      ),
      selectDocuments: jest.fn(() => [
        {
          id: 'x-trend-rules',
          title: 'X 热搜挖掘规则',
          path: '/tmp/rules/x-trend-rules.md',
          markdown: '# X 热搜挖掘规则',
        },
      ]),
    } as unknown as OpportunityRulePackLoaderService;
    const miningAgentService = {
      evaluateGoalWithRun: jest.fn(() =>
        Promise.resolve({
          agentRunId: 'agent_run_1',
          decision: {
            decision: 'create_event',
            title: '热搜事件',
            opportunityType: 'news_event',
            summary: '热搜事件摘要。',
            whyNow: '正在上升。',
            whyItMatters: '值得响应。',
            productAngles: ['热点响应'],
            contentWindow: '24 小时',
            confidence: 'high',
            evidenceRefs: ['cmt_fake_ref'],
            missingData: [],
            riskNotes: [],
          },
        }),
      ),
    } as unknown as OpportunityMiningAgentService;
    const opportunityRepository = {
      createOpportunity: jest.fn(),
      createEvent: jest.fn((input) => Promise.resolve({ id: 'evt_1', ...input })),
      createMiningSignalRun: jest.fn(() => Promise.resolve({})),
    } as unknown as OpportunityRepository;
    const eventLabelingService = {
      buildLabels: jest.fn(() =>
        Promise.resolve([
          {
            code: 'x_trend',
            name: 'X 热搜',
            category: 'source',
            sourcePath: 'x_trend',
            evidenceRefs: ['evi_1'],
            reason: '来自 X 热搜榜',
            confidence: 'high',
          },
          {
            code: 'top_5',
            name: 'Top 5',
            category: 'trigger',
            evidenceRefs: ['evi_1'],
            reason: '进入榜单前 5',
            confidence: 'high',
          },
        ]),
      ),
    } as unknown as EventLabelingService;
    const eventMergeRepository = {
      createSourceContext: jest.fn(() =>
        Promise.resolve({
          id: 'ctx_1',
          mainEventId: 'evt_1',
          sourceType: 'x_trend',
          triggerType: 'top_5',
        }),
      ),
    } as unknown as EventMergeRepository;
    const eventMergeOrchestrator = {
      processIncomingContext: jest.fn(() =>
        Promise.resolve({
          action: 'no_candidate',
        }),
      ),
    } as unknown as EventMergeOrchestratorService;
    const service = new OpportunityMiningOrchestratorService(
      evidenceService,
      rulePackLoader,
      miningAgentService,
      new OpportunityMiningDecisionValidator(),
      opportunityRepository,
      eventLabelingService,
      eventMergeRepository,
      eventMergeOrchestrator,
    );

    await service.run({
      goal: service.createGoal({
        instruction: '判断是否形成事件。',
        seedSignalIds: ['sig_1'],
        writeMode: 'allow_create',
        type: 'form_event',
      }),
    });

    expect(opportunityRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceRefs: ['evi_1'],
        missingData: expect.arrayContaining([
          'Agent 返回的证据引用不是系统内真实证据，已使用当前 Signal 的真实证据回填。',
        ]),
      }),
    );
    expect(eventMergeRepository.createSourceContext).toHaveBeenCalledWith(
      expect.objectContaining({
        mainEventId: 'evt_1',
        sourceType: 'x_trend',
        triggerType: 'top_5',
        triggerRuleCode: 'top_5',
        title: '热搜事件',
        summary: '热搜事件摘要。',
        evidenceRefs: ['evi_1'],
        signalRefs: ['sig_1'],
        payload: expect.objectContaining({
          agentRunId: 'agent_run_1',
        }),
      }),
    );
    expect(eventMergeOrchestrator.processIncomingContext).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ctx_1',
        mainEventId: 'evt_1',
        sourceType: 'x_trend',
      }),
    );
  });
});
