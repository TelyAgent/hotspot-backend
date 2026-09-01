import { ConfigService } from '@nestjs/config';
import { OperationRecommendationService } from './operation-recommendation.service';

describe('OperationRecommendationService', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('adopts a selected angle and records the operator decision', async () => {
    const repository = {
      findRecommendationById: jest.fn().mockResolvedValue({
        id: 'rec_1',
        sourceEventId: 'event_1',
        predxNewsItemId: 'news_1',
        angles: [
          {
            id: 'angle_1',
            claim: '从市场概率变化切入，解释热点对用户判断的影响。',
          },
        ],
      }),
      recordRecommendationDecision: jest.fn().mockResolvedValue({
        id: 'record_1',
        result: 'adopted',
        finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
      }),
    };
    const service = new OperationRecommendationService(
      repository as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );

    const record = await service.adoptRecommendation({
      recommendationId: 'rec_1',
      angleId: 'angle_1',
      operator: 'Rachel',
    });

    expect(record).toMatchObject({
      id: 'record_1',
      result: 'adopted',
      finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
    });
    expect(repository.recordRecommendationDecision).toHaveBeenCalledWith({
      recommendationId: 'rec_1',
      result: 'adopted',
      recommendationStatus: 'adopted',
      finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
      operator: 'Rachel',
      note: undefined,
      metadata: {
        angleId: 'angle_1',
        sourceEventId: 'event_1',
        predxNewsItemId: 'news_1',
      },
    });
  });

  it('generates a public heat recommendation without related PredX news', async () => {
    const event = {
      id: 'event_public_heat',
      title: 'Polymarket 热帖快速升温',
      eventType: 'viral_post',
      summary: 'Polymarket 相关帖子进入短时热度前列。',
      labels: [{ name: 'Topic Circle' }],
      evidenceRefs: ['evidence_1'],
      missingData: [],
      riskNotes: [],
      confidence: 'high',
      status: 'suggested',
      occurredAt: null,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:05:00.000Z'),
      sourceSummary: {
        publicHeatRank: 2,
      },
    };
    const repository = {
      listRecentEvents: jest.fn().mockResolvedValue([event]),
      listPredxNewsItems: jest.fn().mockResolvedValue([]),
      createRecommendation: jest.fn().mockImplementation(async (input) => ({
        id: 'rec_public_heat',
        ...input,
      })),
    };
    const predxNewsClient = {
      fetchLatest: jest.fn().mockResolvedValue([]),
    };
    const service = new OperationRecommendationService(
      repository as never,
      predxNewsClient as never,
      { decide: jest.fn() } as never,
      new ConfigService(),
    );

    const result = await service.generate({ eventTake: 1, newsTake: 0 });

    expect(result.generatedCount).toBe(1);
    expect(repository.createRecommendation).toHaveBeenCalledWith({
      sourceEventId: 'event_public_heat',
      predxNewsItemId: null,
      agentRunId: undefined,
      decision: expect.objectContaining({
        basis: 'heat',
        priority: 'immediate',
        recommendationLabels: expect.arrayContaining(['公共热度']),
        reason: '事件代表内容进入 X 短时增速排行榜前 3，满足公共热度推荐路径。',
        predxOpportunity: expect.objectContaining({
          status: 'none',
          associationLevel: 'none',
        }),
      }),
    });
  });

  it('lets the agent assess product value when an event has no related PredX news', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const event = {
      id: 'event_product_value',
      title: 'AI 公司发布新模型',
      eventType: 'product_or_market_event',
      summary: 'AI 公司发布新模型，行业讨论快速扩散。',
      labels: [{ name: 'AI' }],
      evidenceRefs: ['evidence_2'],
      missingData: [],
      riskNotes: [],
      confidence: 'medium',
      status: 'suggested',
      occurredAt: new Date('2026-09-01T07:00:00.000Z'),
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:05:00.000Z'),
    };
    const agentDecision = {
      title: 'AI 公司发布新模型 × PredX 承接选题',
      summary: '该事件可从预测和市场反应角度承接。',
      recommendationLabels: ['产品价值'],
      basis: 'product',
      priority: 'today',
      reason: '命中产品配置的 L3 主题连接。',
      predxOpportunity: {
        status: 'supported',
        associationLevel: 'L3_thematic',
        rationale: '热点适合从事件路径和市场反应切入。',
        selectedProductValue: '用 PredX 跟踪热点新闻和相关市场反应。',
        recommendedProductPage: 'news',
        recommendedProductUrl: 'https://predx.pro/news',
        urlReason: '适合进入新闻页理解事件。',
      },
      angles: [
        {
          level: 'L3_thematic',
          claim: '从新模型发布后的市场预期变化切入。',
          evidence: ['evidence_2'],
          riskNotes: [],
        },
      ],
      evidenceRefs: ['evidence_2'],
      missingData: [],
      riskNotes: [],
      confidence: 'medium',
    };
    const repository = {
      listRecentEvents: jest.fn().mockResolvedValue([event]),
      listPredxNewsItems: jest.fn().mockResolvedValue([]),
      createRecommendation: jest.fn().mockResolvedValue({ id: 'rec_product_value' }),
    };
    const predxNewsClient = {
      fetchLatest: jest.fn().mockResolvedValue([]),
    };
    const agent = {
      decide: jest.fn().mockResolvedValue({
        decision: agentDecision,
        agentRunId: 'agent_run_1',
      }),
    };
    const service = new OperationRecommendationService(
      repository as never,
      predxNewsClient as never,
      agent as never,
      new ConfigService(),
    );

    await service.generate({ eventTake: 1, newsTake: 0 });

    expect(agent.decide).toHaveBeenCalledWith({
      event: expect.objectContaining({
        id: 'event_product_value',
        operationDecisionHints: expect.objectContaining({
          publicHeat: false,
        }),
      }),
      predxNews: [],
      productReference: expect.any(String),
    });
    expect(repository.createRecommendation).toHaveBeenCalledWith({
      sourceEventId: 'event_product_value',
      predxNewsItemId: null,
      agentRunId: 'agent_run_1',
      decision: agentDecision,
    });
  });

  it('passes same-domain PredX news to the agent even when text overlap is weak', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const event = {
      id: 'event_geopolitics',
      title: '区域冲突风险升温',
      eventType: 'industry_topic',
      summary: '多个来源正在讨论区域冲突风险。',
      labels: [{ name: 'Geopolitics & Conflict' }],
      evidenceRefs: ['evidence_3'],
      missingData: [],
      riskNotes: [],
      confidence: 'medium',
      status: 'suggested',
      occurredAt: null,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
      updatedAt: new Date('2026-09-01T08:05:00.000Z'),
    };
    const news = {
      id: 'news_geopolitics',
      externalId: 'predx_news_1',
      eventId: null,
      factId: null,
      title: 'Kyiv air defense gap draws new market attention',
      newsTitle: 'Kyiv air defense gap draws new market attention',
      sourceName: 'PredX',
      sourceUrl: 'https://predx.pro/news/1',
      category: 'geopolitics',
      publishedAt: new Date('2026-09-01T07:30:00.000Z'),
      latestAt: null,
      primaryMarketTitle: 'Will Ukraine strike another tanker?',
      primaryMarketUrl: 'https://predx.pro/market/1',
      primaryMarketConfidence: null,
      associatedMarketDisplayScore: null,
      relatedMarkets: [],
      raw: {},
      createdAt: new Date('2026-09-01T07:30:00.000Z'),
      updatedAt: new Date('2026-09-01T07:30:00.000Z'),
    };
    const agentDecision = {
      title: '区域冲突风险升温 × PredX 承接选题',
      summary: '该事件可从冲突风险和预测市场反应角度承接。',
      recommendationLabels: ['产品价值'],
      basis: 'product',
      priority: 'today',
      reason: '同领域 PredX 新闻提供了可判断上下文。',
      predxOpportunity: {
        status: 'supported',
        associationLevel: 'L3_thematic',
        rationale: '同属地缘冲突领域。',
        selectedProductValue: '跟踪事件后续和市场反应。',
        recommendedProductPage: 'news',
        recommendedProductUrl: 'https://predx.pro/news',
        urlReason: '适合进入新闻页。',
      },
      angles: [
        {
          level: 'L3_thematic',
          claim: '从冲突风险的后续变量切入。',
          evidence: ['evidence_3'],
          riskNotes: [],
        },
      ],
      evidenceRefs: ['evidence_3'],
      missingData: [],
      riskNotes: [],
      confidence: 'medium',
    };
    const repository = {
      listRecentEvents: jest.fn().mockResolvedValue([event]),
      listPredxNewsItems: jest.fn().mockResolvedValue([news]),
      createRecommendation: jest.fn().mockResolvedValue({ id: 'rec_domain' }),
    };
    const predxNewsClient = {
      fetchLatest: jest.fn().mockResolvedValue([]),
    };
    const agent = {
      decide: jest.fn().mockResolvedValue({
        decision: agentDecision,
        agentRunId: 'agent_run_domain',
      }),
    };
    const service = new OperationRecommendationService(
      repository as never,
      predxNewsClient as never,
      agent as never,
      new ConfigService(),
    );

    await service.generate({ eventTake: 1, newsTake: 1 });

    expect(agent.decide).toHaveBeenCalledWith({
      event: expect.objectContaining({
        id: 'event_geopolitics',
      }),
      predxNews: [
        expect.objectContaining({
          id: 'news_geopolitics',
          category: 'geopolitics',
        }),
      ],
      productReference: expect.any(String),
    });
    expect(repository.createRecommendation).toHaveBeenCalledWith({
      sourceEventId: 'event_geopolitics',
      predxNewsItemId: null,
      agentRunId: 'agent_run_domain',
      decision: agentDecision,
    });
  });
});
