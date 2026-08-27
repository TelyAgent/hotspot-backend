import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { OpportunityMiningDecisionValidator } from '../../../src/opportunity/mining/opportunity-mining-decision.validator';
import { OpportunityMiningAgentService } from '../../../src/opportunity/mining/opportunity-mining-agent.service';
import { EvidenceItem } from '../../../src/signal/evidence/evidence.types';

describe('OpportunityMiningAgentService', () => {
  it('returns create_opportunity when evidence is sufficient', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: 'create_opportunity',
            title: 'OpenAI 新模型发布',
            opportunityType: 'industry_topic',
            summary: 'OpenAI 新模型发布引发开发者讨论。',
            whyNow: '官方发布后短时间内出现讨论。',
            whyItMatters: '该事件影响 AI 产品策略。',
            productAngles: ['展示如何监控 AI 产品发布'],
            contentWindow: '24-48 小时',
            confidence: 'medium',
            evidenceRefs: ['ev_1'],
            missingData: [],
            riskNotes: ['需要确认更多技术细节。'],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    const result = await service.evaluate({
      instruction: '判断是否形成机会。',
      evidence: [createEvidence()],
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'opportunity_mining',
        maxSteps: 6,
      }),
    );
    expect(result.decision).toBe('create_opportunity');
    expect(result.evidenceRefs).toEqual(['ev_1']);
  });

  it('passes rule documents and evidence memory to workflow engine', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: 'create_insight',
            title: 'OpenAI 新模型发布',
            opportunityType: 'industry_topic',
            summary: 'OpenAI 新模型发布引发开发者讨论。',
            whyNow: '官方发布后短时间内出现讨论。',
            whyItMatters: '该事件影响 AI 产品策略。',
            productAngles: ['展示如何监控 AI 产品发布'],
            contentWindow: '24-48 小时',
            confidence: 'medium',
            evidenceRefs: ['ev_1'],
            missingData: [],
            riskNotes: [],
            metadata: {
              ruleDocumentRefs: ['global-principles'],
            },
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    await service.evaluateGoal(
      {
        id: 'goal_1',
        type: 'detect_opportunity',
        instruction: '判断是否形成机会。',
        seedSignalIds: ['sig_1'],
        seedEvidenceIds: ['ev_1'],
        ruleDocuments: [
          {
            id: 'global-principles',
            title: '全局判断原则',
            path: 'memory://global-principles.md',
            markdown: '# 全局判断原则',
          },
        ],
        constraints: {
          maxToolCalls: 3,
          maxRunMs: 60_000,
          allowedToolCategories: ['read'],
          writeMode: 'suggest_only',
        },
      },
      {
        evidence: [createEvidence()],
        enrichedPackages: [
          {
            signalId: 'sig_1',
            signalType: 'x_trend',
            evidenceRefs: ['ev_1'],
            evidenceItems: [],
            qualityGate: {
              level: 'thin',
              canCreateEvent: false,
              canUseHighConfidence: false,
              hasOpenableSource: true,
              hasReasonEvidence: false,
              hasActorActionObject: false,
              missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
              riskNotes: ['当前只有热搜榜信号，不能直接当成现实事件事实。'],
            },
            conservativeTitle: 'United States X 热搜：OpenAI',
            domainLabels: [],
            enrichmentSummary: '缺少解释热搜原因的相关帖子或外部来源。',
          },
        ],
      },
    );

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'opportunity_mining',
        maxSteps: 3,
        goal: expect.objectContaining({
          ruleDocuments: [
            expect.objectContaining({
              id: 'global-principles',
            }),
          ],
          evidenceMemory: expect.objectContaining({
            evidence: [
              expect.objectContaining({
                id: 'ev_1',
              }),
            ],
            enrichedPackages: [
              expect.objectContaining({
                signalId: 'sig_1',
                qualityGate: expect.objectContaining({
                  canCreateEvent: false,
                }),
                conservativeTitle: 'United States X 热搜：OpenAI',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('returns request_human_review when evidence is insufficient', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: 'request_human_review',
            title: 'AI 模型传闻',
            opportunityType: 'unknown',
            summary: '只有单一来源提到相关传闻。',
            whyNow: '出现了早期讨论。',
            whyItMatters: '可能是潜在机会，但证据不足。',
            productAngles: [],
            contentWindow: '观察中',
            confidence: 'low',
            evidenceRefs: [],
            missingData: ['缺少官方来源'],
            riskNotes: ['不能确认事实。'],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    const result = await service.evaluate({
      instruction: '判断是否形成机会。',
    });

    expect(result.decision).toBe('request_human_review');
    expect(result.missingData).toEqual(['缺少官方来源']);
  });

  it('normalizes nested decisions and fills safe defaults for optional model omissions', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: {
              decision: 'ignore',
              title: '证据不足',
              summary: '当前只有热搜关键词，不能确认具体事件。',
              whyNow: '热搜榜出现该关键词。',
              whyItMatters: '证据不足，暂不形成事件。',
              evidenceRefs: ['ev_1'],
            },
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    const result = await service.evaluate({
      instruction: '判断是否形成机会。',
      evidence: [createEvidence()],
    });

    expect(result).toEqual(
      expect.objectContaining({
        decision: 'ignore',
        opportunityType: 'unknown',
        productAngles: [],
        contentWindow: '观察中',
        confidence: 'low',
        missingData: [],
        riskNotes: [],
      }),
    );
  });

  it('rejects create_opportunity decisions without evidence refs', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            decision: 'create_opportunity',
            title: 'AI 模型传闻',
            opportunityType: 'unknown',
            summary: '出现传闻。',
            whyNow: '短期讨论。',
            whyItMatters: '可能影响行业。',
            productAngles: [],
            contentWindow: '24 小时',
            confidence: 'low',
            evidenceRefs: [],
            missingData: [],
            riskNotes: [],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    await expect(
      service.evaluate({
        instruction: '判断是否形成机会。',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'OPPORTUNITY_MINING_EVIDENCE_REQUIRED',
      }),
    );
  });

  it('rejects goals without rule documents', async () => {
    const workflowEngine = {
      run: jest.fn(),
    } as unknown as AgentWorkflowEngine;
    const service = createService(workflowEngine);

    await expect(
      service.evaluateGoal({
        id: 'goal_1',
        type: 'detect_opportunity',
        instruction: '判断是否形成机会。',
        seedSignalIds: [],
        ruleDocuments: [],
        constraints: {
          maxToolCalls: 3,
          maxRunMs: 60_000,
          allowedToolCategories: ['read'],
          writeMode: 'suggest_only',
        },
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'OPPORTUNITY_MINING_RULE_DOCUMENTS_REQUIRED',
      }),
    );
  });
});

function createService(workflowEngine: AgentWorkflowEngine) {
  return new OpportunityMiningAgentService(
    workflowEngine,
    new OpportunityMiningDecisionValidator(),
  );
}

function createEvidence(): EvidenceItem {
  return {
    id: 'ev_1',
    signalId: 'sig_1',
    sourceTool: null,
    sourceType: 'post',
    sourceItemId: 'sig_1',
    claim: 'OpenAI 发布新模型。',
    text: 'OpenAI 发布新模型。',
    url: 'https://x.com/OpenAI/status/1',
    author: 'OpenAI',
    publishedAt: new Date('2026-08-24T10:00:00.000Z'),
    observedAt: new Date('2026-08-24T10:10:00.000Z'),
    metrics: null,
    confidence: 'high',
    rawRef: 'raw_1',
    metadata: null,
    createdAt: new Date('2026-08-24T10:10:00.000Z'),
    updatedAt: new Date('2026-08-24T10:10:00.000Z'),
  };
}
