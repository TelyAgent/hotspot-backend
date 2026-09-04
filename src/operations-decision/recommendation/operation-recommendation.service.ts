import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Event, PredxNewsItem } from '@prisma/client';
import { ContentDraftRepository } from '../../content/draft/content-draft.repository';
import { ContentGenerationAgentService } from '../../content/generation/content-generation-agent.service';
import { ContentTask } from '../../content/content.types';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { OperationsDecisionRepository } from '../operations-decision.repository';
import {
  OperationRecommendationDecision,
  OperationRecommendationEvidenceItem,
} from '../operations-decision.types';
import { PredxNewsClientService } from '../predx-news/predx-news-client.service';
import { OperationRecommendationAgentService } from './operation-recommendation-agent.service';

interface OperationContentDraftInput {
  angleIds?: string[];
  goals?: string[];
  readers?: string[];
  formats?: string[];
  userInstruction?: string;
}

interface OperationContentRevisionInput extends OperationContentDraftInput {
  body: string;
  instruction: string;
}

interface OperationContentAdoptInput extends OperationContentDraftInput {
  draftId?: string;
  body?: string;
}

@Injectable()
export class OperationRecommendationService {
  constructor(
    private readonly repository: OperationsDecisionRepository,
    private readonly predxNewsClient: PredxNewsClientService,
    private readonly agent: OperationRecommendationAgentService,
    private readonly configService: ConfigService,
    private readonly contentGenerationAgent: ContentGenerationAgentService,
    private readonly contentDraftRepository: ContentDraftRepository,
  ) {}

  async syncPredxNews(input: { pageSize?: number; index?: number } = {}) {
    const items = await this.predxNewsClient.fetchLatest({
      pageSize: input.pageSize ?? 20,
      index: input.index ?? 0,
    });
    const saved = [];
    for (const item of items) {
      saved.push(await this.repository.upsertPredxNewsItem(item));
    }
    return {
      count: saved.length,
      items: saved,
    };
  }

  async generate(input: { eventTake?: number; newsTake?: number } = {}) {
    const synced = await this.trySyncPredxNews(input.newsTake ?? 20);
    const [events, newsItems] = await Promise.all([
      this.repository.listRecentEvents({ take: input.eventTake ?? 20 }),
      this.repository.listPredxNewsItems({ take: input.newsTake ?? 20 }),
    ]);
    const productReference = await this.loadProductReference();
    const created = [];

    for (const event of events) {
      const relatedNews = this.pickRelatedNews(event, newsItems);
      const predxContext = this.buildPredxContext(event, newsItems, relatedNews);
      const publicHeat = this.detectPublicHeatPath(event);
      const productValue = this.detectProductValuePath(event);
      const canAskAgent = Boolean(this.configService.get<string>('OPENAI_API_KEY'));

      let decision = relatedNews.length
        ? this.createFallbackDecision(event, relatedNews[0])
        : publicHeat
          ? this.createPublicHeatDecision(event)
          : productValue
            ? this.createProductValueDecision(event)
          : undefined;
      let agentRunId: string | undefined;

      if (canAskAgent) {
        const agentResult = await this.agent.decide({
          event: {
            ...serializeEvent(event),
            operationDecisionHints: {
              publicHeat,
              publicHeatReason: publicHeat
                ? '事件代表内容进入 X 短时增速排行榜前 3，满足公共热度推荐路径。'
                : null,
              relatedPredxNewsCount: relatedNews.length,
              predxContextCount: predxContext.length,
              productValue,
              productValueReason: productValue
                ? '事件领域或标签命中 PredX 可承接范围，可按 L3/L4 产品价值路径判断。'
                : null,
            },
          },
          predxNews: predxContext.map(serializeNews),
          productReference,
        });
        if (agentResult.skipped && !decision) {
          continue;
        }
        if (agentResult.decision?.angles.length) {
          decision = this.sanitizeDecisionPaths(agentResult.decision, {
            publicHeat,
            hasRelatedMarket: relatedNews.some(newsHasMarket),
            productValue,
          });
          if (publicHeat) {
            decision = withPublicHeatLabel(decision);
          }
        }
        agentRunId = agentResult.agentRunId;
      }

      if (!decision) {
        continue;
      }
      decision = this.sanitizeDecisionPaths(decision, {
        publicHeat,
        hasRelatedMarket: relatedNews.some(newsHasMarket),
        productValue,
      });

      created.push(await this.repository.createRecommendation({
        sourceEventId: event.id,
        predxNewsItemId: relatedNews[0]?.id ?? null,
        decision,
        agentRunId,
      }));
    }

    return {
      syncedPredxNewsCount: synced.count,
      candidateEventCount: events.length,
      predxNewsCount: newsItems.length,
      generatedCount: created.length,
      items: created,
    };
  }

  listPredxNewsItems(input: { take?: number } = {}) {
    return this.repository.listPredxNewsItems(input);
  }

  listRecommendations(input: { basis?: string; priority?: string; take?: number }) {
    return this.repository.listRecommendations({
      status: 'pending',
      basis: input.basis === 'all' ? undefined : input.basis,
      priority: input.priority === 'all' ? undefined : input.priority,
      take: input.take,
    });
  }

  findRecommendationById(id: string) {
    return this.repository.findRecommendationById(id);
  }

  async generateContentDraft(
    recommendationId: string,
    input: OperationContentDraftInput,
  ) {
    const context = await this.buildContentContext(recommendationId, input);
    const draft = await this.contentGenerationAgent.generate({
      contentTask: context.contentTask,
      accountPersona: this.buildAccountPersona(input),
      contentRules: this.buildContentRules(input),
      generationPrompt: this.buildGenerationPrompt(context),
      evidence: context.evidence,
      userInstruction: input.userInstruction,
    });

    return {
      contentTaskId: context.contentTask.id,
      draft,
    };
  }

  async reviseContentDraft(
    recommendationId: string,
    input: OperationContentRevisionInput,
  ) {
    if (!input.body.trim()) {
      throw new DomainError(
        'Revision requires current draft body.',
        'OPERATION_CONTENT_BODY_REQUIRED',
      );
    }
    if (!input.instruction.trim()) {
      throw new DomainError(
        'Revision instruction is required.',
        'OPERATION_CONTENT_REVISION_INSTRUCTION_REQUIRED',
      );
    }

    const context = await this.buildContentContext(recommendationId, input);
    const draft = await this.contentGenerationAgent.generate({
      contentTask: context.contentTask,
      accountPersona: this.buildAccountPersona(input),
      contentRules: this.buildContentRules(input),
      generationPrompt: [
        this.buildGenerationPrompt(context),
        '',
        '请基于下面这版旧稿做修改，不要丢失已经成立的事实边界。',
        '旧稿：',
        input.body,
      ].join('\n'),
      evidence: context.evidence,
      userInstruction: input.instruction,
    });

    return {
      contentTaskId: context.contentTask.id,
      draft,
    };
  }

  async adoptContentDraft(
    recommendationId: string,
    input: OperationContentAdoptInput,
  ) {
    if (!input.draftId && !input.body?.trim()) {
      throw new DomainError(
        'Adopting content requires draftId or body.',
        'OPERATION_CONTENT_ADOPT_BODY_REQUIRED',
      );
    }
    const context = await this.buildContentContext(recommendationId, input);
    let draft = input.draftId
      ? await this.contentDraftRepository.updateStatus(input.draftId, 'approved')
      : null;

    if (!draft && input.body?.trim()) {
      const version = await this.contentDraftRepository.getNextVersion(
        context.contentTask.id,
      );
      draft = await this.contentDraftRepository.create({
        contentTaskId: context.contentTask.id,
        version,
        body: input.body,
        evidenceRefs: context.contentTask.evidenceRefs,
        generationInput: {
          adoptedFrom: 'operation_decision_creation_workspace',
          recommendationId,
          selectedAngleIds: input.angleIds ?? [],
          goals: input.goals ?? [],
          readers: input.readers ?? [],
          formats: input.formats ?? [],
        },
        userInstruction: null,
        status: 'approved',
      });
    }

    await this.repository.markRecommendationContentGenerated(recommendationId);

    return {
      contentTaskId: context.contentTask.id,
      draft,
      publishPath: '/decision/publish',
    };
  }

  async listApprovedContentDrafts(input: { take?: number } = {}) {
    const items = await this.repository.listApprovedRecommendationDrafts(input);
    return items.map(({ draft, recommendation }) => {
      const generationInput = getRecord(draft.generationInput);
      const contentTaskInput = getRecord(generationInput.contentTask);
      return {
        id: draft.id,
        contentTaskId: draft.contentTaskId,
        recommendationId: recommendation.id,
        title: recommendation.title,
        summary: recommendation.summary,
        draft: draft.body,
        status: draft.status,
        updatedAt: draft.updatedAt,
        recommendationLabels: readStringArray(recommendation.recommendationLabels),
        selectedAngle:
          readString(contentTaskInput.angle) ??
          recommendation.angles[0]?.claim ??
          null,
        format:
          readString(contentTaskInput.contentType) ??
          readString(generationInput.format) ??
          null,
        predxUrl:
          recommendation.recommendedProductUrl ??
          recommendation.predxNewsItem?.primaryMarketUrl ??
          null,
      };
    });
  }

  listInbox() {
    return this.repository.listInbox();
  }

  createInboxItem(input: { rawContent: string; source?: string; sourceUrl?: string }) {
    return this.repository.createInboxItem(input);
  }

  private async buildContentContext(
    recommendationId: string,
    input: OperationContentDraftInput,
  ) {
    const recommendation = await this.repository.findRecommendationRecordById(
      recommendationId,
    );
    if (!recommendation) {
      throw new DomainError(
        'Operation recommendation not found.',
        'OPERATION_RECOMMENDATION_NOT_FOUND',
        { recommendationId },
      );
    }

    const angleIds = new Set(input.angleIds ?? []);
    const selectedAngles =
      angleIds.size > 0
        ? recommendation.angles.filter((angle) => angleIds.has(angle.id))
        : recommendation.angles.slice(0, 1);
    const evidenceRefs = getStringArray(recommendation.evidenceRefs);
    const contentTask = await this.repository.upsertRecommendationContentTask({
      recommendationId,
      contentType: (input.formats?.length ? input.formats : ['X Thread']).join('、'),
      contentGoal: (input.goals?.length ? input.goals : ['把事情讲清楚']).join('、'),
      angle: selectedAngles.map((angle) => angle.claim).join('；') || recommendation.reason,
      constraints: {
        readers: input.readers ?? [],
        formats: input.formats ?? [],
        selectedAngleIds: [...angleIds],
      },
      evidenceRefs,
    });
    const attached = await this.repository.findRecommendationById(recommendationId);
    const evidence = this.buildContentEvidence(
      attached?.evidenceItems ?? [],
      recommendation,
    );

    return {
      recommendation,
      selectedAngles,
      contentTask: {
        ...contentTask,
        constraints: toStringArray(contentTask.constraints),
        evidenceRefs,
      } as unknown as ContentTask,
      evidence,
    };
  }

  private buildContentEvidence(
    evidenceItems: OperationRecommendationEvidenceItem[],
    recommendation: Awaited<ReturnType<OperationsDecisionRepository['findRecommendationRecordById']>>,
  ): EvidenceItem[] {
    const resolved = evidenceItems.map((item) => ({
      id: item.id,
      signalId: null,
      sourceTool: item.sourceName ?? null,
      sourceType: item.sourceType,
      sourceItemId: item.title ?? null,
      claim: item.summary,
      text: item.text ?? item.summary,
      url: item.url ?? null,
      author: item.authorName ?? null,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      observedAt: new Date(item.observedAt),
      metrics: item.metrics as JsonValue,
      confidence: normalizeConfidence(item.confidence, 'medium'),
      rawRef: null,
      metadata: null,
      createdAt: new Date(item.observedAt),
      updatedAt: new Date(item.observedAt),
    })) satisfies EvidenceItem[];

    if (resolved.length > 0) {
      return resolved;
    }

    const now = new Date();
    return [
      {
        id: recommendation?.id ?? 'operation-recommendation',
        signalId: null,
        sourceTool: 'operations_decision',
        sourceType: 'operation_recommendation',
        sourceItemId: recommendation?.id ?? null,
        claim: recommendation?.reason ?? '运营推荐进入内容创作。',
        text: [recommendation?.title, recommendation?.summary, recommendation?.reason]
          .filter(Boolean)
          .join('\n'),
        url: recommendation?.recommendedProductUrl ?? null,
        author: null,
        publishedAt: null,
        observedAt: now,
        metrics: null,
        confidence: normalizeConfidence(recommendation?.confidence, 'medium'),
        rawRef: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  private buildGenerationPrompt(input: {
    recommendation: Awaited<ReturnType<OperationsDecisionRepository['findRecommendationRecordById']>>;
    selectedAngles: Array<{ claim: string; userValue: string | null; targetUser: string | null; productUrl: string | null }>;
  }): string {
    const recommendation = input.recommendation;
    return [
      '请根据运营决策推荐生成可直接发布的中文内容。',
      '要求：',
      '- 只基于给定事件、承接角度、证据和 PredX 连接生成，不补造事实。',
      '- 输出完整正文，不要解释你的生成过程。',
      '- 如果是 X Thread，要按 1/、2/ 或分段形式组织。',
      '',
      `选题：${recommendation?.title ?? ''}`,
      `事件摘要：${recommendation?.summary ?? ''}`,
      `推荐原因：${recommendation?.reason ?? ''}`,
      `承接判断：${recommendation?.productAssociationRationale ?? ''}`,
      `推荐链接：${recommendation?.recommendedProductUrl ?? ''}`,
      `承接角度：${input.selectedAngles.map((angle) => angle.claim).join('；')}`,
      `目标用户：${input.selectedAngles.map((angle) => angle.targetUser).filter(Boolean).join('；')}`,
    ].join('\n');
  }

  private buildAccountPersona(input: OperationContentDraftInput): string {
    return [
      '你是 PredX 的运营内容助手。',
      '表达要克制、清楚、有判断，避免夸张营销腔。',
      input.readers?.length ? `目标读者：${input.readers.join('、')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildContentRules(input: OperationContentDraftInput): string {
    return [
      '所有正文统一使用中文，平台名、产品名、市场名可以保留英文。',
      '不得编造未提供的事实、数据、来源和链接。',
      '不得给出投资建议，不把市场概率写成事实结论。',
      input.goals?.length ? `内容目标：${input.goals.join('、')}` : null,
      input.formats?.length ? `内容形式：${input.formats.join('、')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async trySyncPredxNews(pageSize: number) {
    try {
      return await this.syncPredxNews({ pageSize, index: 0 });
    } catch {
      return { count: 0, items: [] };
    }
  }

  private pickRelatedNews(event: Event, newsItems: PredxNewsItem[]): PredxNewsItem[] {
    const eventText = `${event.title} ${event.summary} ${JSON.stringify(event.labels ?? [])}`.toLowerCase();
    return newsItems
      .map((news) => ({
        news,
        score: scoreTextOverlap(eventText, `${news.title} ${news.newsTitle ?? ''} ${news.primaryMarketTitle ?? ''}`),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.news);
  }

  private buildPredxContext(
    event: Event,
    newsItems: PredxNewsItem[],
    relatedNews: PredxNewsItem[],
  ): PredxNewsItem[] {
    const domainRelatedNews = this.pickDomainRelatedNews(event, newsItems);
    return uniqueNewsItems([
      ...relatedNews,
      ...domainRelatedNews,
      ...newsItems.slice(0, 6),
    ]).slice(0, 8);
  }

  private pickDomainRelatedNews(event: Event, newsItems: PredxNewsItem[]): PredxNewsItem[] {
    const domains = getLabelNames(event.labels);
    const wantedCategories = new Set(
      domains.flatMap((label) => mapEventLabelToPredxCategories(label)),
    );
    if (!wantedCategories.size) {
      return [];
    }

    return newsItems
      .filter((news) => {
        const category = (news.category ?? '').toLowerCase();
        return [...wantedCategories].some((item) => category.includes(item));
      })
      .slice(0, 4);
  }

  private createFallbackDecision(
    event: Event,
    news: PredxNewsItem,
  ): OperationRecommendationDecision {
    const hasMarket = newsHasMarket(news);
    const labels = [
      hasMarket ? '实时市场' : '产品价值',
      news.category ? mapCategoryLabel(news.category) : undefined,
      hasMarket ? 'L1 直接连接' : 'L3 主题连接',
    ].filter((item): item is string => Boolean(item));

    return {
      title: `${event.title} × PredX 承接选题`,
      summary: `该热点与 PredX 新闻“${news.title}”存在可解释的事件或市场关联，适合作为运营选题评估。`,
      recommendationLabels: labels,
      basis: hasMarket ? 'market' : 'product',
      priority: isRecent(event.createdAt, 2) || isRecent(news.publishedAt, 2) ? 'immediate' : 'today',
      reason: hasMarket
        ? `PredX 新闻接口返回了相关市场“${news.primaryMarketTitle}”，可从新闻与预测市场关系切入。`
        : '事件可从新闻、概率、不确定性或市场反应角度与 PredX 做主题承接。',
      predxOpportunity: {
        status: 'supported',
        associationLevel: hasMarket ? 'L1_direct' : 'L3_thematic',
        rationale: hasMarket
          ? '热点事件与 PredX 返回的活跃市场存在直接或高度相关连接。'
          : '热点属于可讨论结果、概率、事件路径或市场反应的主题。',
        selectedProductValue: hasMarket
          ? '从新闻找到相关预测市场，并观察市场如何反应。'
          : '把热点新闻整理成事件，并从预测和不确定性角度理解后续变化。',
        recommendedProductPage: hasMarket ? 'market' : 'news',
        recommendedProductUrl: hasMarket
          ? news?.primaryMarketUrl ?? 'https://predx.pro/market'
          : 'https://predx.pro/news',
        urlReason: hasMarket
          ? '存在接口返回的相关 Polymarket 市场。'
          : '更适合先进入 PredX News 作为新闻与事件承接入口。',
      },
      angles: [
        {
          level: hasMarket ? 'L1_direct' : 'L3_thematic',
          claim: hasMarket
            ? `从“${news.primaryMarketTitle}”切入，解释这条新闻如何影响市场预期。`
            : '从热点事件的不确定性切入，解释为什么用户可以用 PredX 跟踪事件路径。',
          targetUser: '关注新闻如何影响预测市场的用户',
          userValue: '帮助用户从热点事实延伸到可观察的市场和后续变量。',
          evidence: [event.id, news.externalId],
          productUrl: hasMarket ? news.primaryMarketUrl ?? undefined : 'https://predx.pro/news',
          riskNotes: ['不能把市场价格写成事实结论，不能给出投资建议。'],
        },
        {
          level: 'L3_thematic',
          claim: '用时间线方式梳理事件发生、市场反应和后续观察点。',
          targetUser: '需要快速理解事件背景的新用户',
          userValue: '降低理解门槛，并建立 PredX 的新闻情报定位。',
          evidence: [event.id, news.externalId],
          productUrl: 'https://predx.pro/news',
          riskNotes: ['需要标注证据发布时间，避免暗示确定因果。'],
        },
      ],
      evidenceRefs: [event.id, news.externalId],
      missingData: [],
      riskNotes: ['市场关系来自运行时接口匹配，不应写成 PredX 页面已经正式展示该关系。'],
      confidence: hasMarket ? 'high' : 'medium',
    };
  }

  private createPublicHeatDecision(event: Event): OperationRecommendationDecision {
    const evidenceRefs = getStringArray(event.evidenceRefs);

    return {
      title: `${event.title} × 公共热度选题`,
      summary: `该热点的代表内容进入 X 短时增速排行榜前 3，适合作为公共热度选题进入人工判断。`,
      recommendationLabels: ['公共热度'],
      basis: 'heat',
      priority: 'immediate',
      reason: '事件代表内容进入 X 短时增速排行榜前 3，满足公共热度推荐路径。',
      predxOpportunity: {
        status: 'none',
        associationLevel: 'none',
        rationale: '当前仅确认公共热度路径成立，尚未确认与 PredX 市场或产品价值存在自然连接。',
        selectedProductValue: '',
        recommendedProductPage: 'home',
        recommendedProductUrl: 'https://predx.pro/home',
        urlReason: '公共热度路径不强制要求存在具体产品承接链接。',
      },
      angles: [
        {
          level: 'public_heat',
          claim: '先解释该事件为什么在短时间内引发公共讨论，再由运营判断是否需要进一步寻找 PredX 承接角度。',
          targetUser: '关注热点变化和事件传播的用户',
          userValue: '帮助用户快速理解热点升温原因和后续观察价值。',
          evidence: evidenceRefs,
          productUrl: undefined,
          riskNotes: ['当前仅基于公共热度进入推荐，不应强行写成 PredX 市场已经承接。'],
        },
      ],
      evidenceRefs,
      missingData: ['尚未确认是否存在直接或类似 PredX 市场。'],
      riskNotes: ['公共热度不等于事件事实已经被多方确认。'],
      confidence: normalizeConfidence(event.confidence, 'medium'),
    };
  }

  private createProductValueDecision(
    event: Event,
    news?: PredxNewsItem,
  ): OperationRecommendationDecision {
    const evidenceRefs = getStringArray(event.evidenceRefs);
    const hasMarket = newsHasMarket(news);
    const labels = ['产品价值', ...getProductValueLabels(event, news)].filter(
      (item, index, arr) => arr.indexOf(item) === index,
    );

    return {
      title: `${event.title} × PredX 产品承接选题`,
      summary: `该热点可从事件不确定性、后续走向或市场预期变化切入，作为 PredX 运营选题候选。`,
      recommendationLabels: labels,
      basis: 'product',
      priority: isRecent(event.createdAt, 6) ? 'immediate' : 'today',
      reason: '事件领域或语义命中 PredX 产品承接范围，满足产品价值推荐路径；当前不要求存在精确市场匹配。',
      predxOpportunity: {
        status: 'supported',
        associationLevel: 'L3_thematic',
        rationale: '热点适合被整理成可跟踪的事件线索，并用概率、市场反应或后续观察点承接。',
        selectedProductValue: '帮助用户从热点事实进入 PredX 的新闻、事件和预测市场观察。',
        recommendedProductPage: hasMarket ? 'market' : 'news',
        recommendedProductUrl: hasMarket ? (news?.primaryMarketUrl ?? 'https://predx.pro/market') : 'https://predx.pro/news',
        urlReason: hasMarket
          ? '当前上下文中存在可参考的 PredX 相关市场。'
          : '当前更适合进入 PredX News 作为热点承接入口。',
      },
      angles: [
        {
          level: 'L3_thematic',
          claim: `从“${event.title}”的后续走向切入，解释用户为什么可以用 PredX 持续跟踪事件变化。`,
          targetUser: '关注热点后续发展和市场反应的用户',
          userValue: '把分散热点转成可观察的问题、时间线和后续变量。',
          evidence: evidenceRefs.length ? evidenceRefs : [event.id],
          productUrl: 'https://predx.pro/news',
          riskNotes: ['不要把预测或市场价格写成事实结论，避免投资建议。'],
        },
        {
          level: 'L4_conceptual',
          claim: '用“已知事实、未知变量、下一观察点”的结构降低热点理解门槛。',
          targetUser: '需要快速判断热点价值的新用户',
          userValue: '让用户理解 PredX 不只是看新闻，而是跟踪事件不确定性。',
          evidence: evidenceRefs.length ? evidenceRefs : [event.id],
          productUrl: 'https://predx.pro/news',
          riskNotes: ['如果缺少直接市场，表达时要明确这是产品价值承接，不是市场已匹配。'],
        },
      ],
      evidenceRefs,
      missingData: news ? [] : ['尚未找到精确匹配的 PredX 市场或新闻。'],
      riskNotes: ['产品承接基于主题和使用场景相关性，需要运营人员最终选择角度。'],
      confidence: normalizeConfidence(event.confidence, 'medium'),
    };
  }

  private detectPublicHeatPath(event: Event): boolean {
    const sourceSummary = toJsonObject(event.sourceSummary);
    const rank =
      getNumber(sourceSummary.publicHeatRank) ??
      getNumber(sourceSummary.shortTermGrowthRank) ??
      getNumber(sourceSummary.representativePostGrowthRank);
    if (rank !== undefined) {
      return rank <= 3;
    }

    return getLabelNames(event.labels).includes('公共热度');
  }

  private detectProductValuePath(event: Event): boolean {
    const labelNames = getLabelNames(event.labels);
    return labelNames.some((label) => PRODUCT_VALUE_EVENT_LABELS.has(label));
  }

  private sanitizeDecisionPaths(
    decision: OperationRecommendationDecision,
    paths: { publicHeat: boolean; hasRelatedMarket: boolean; productValue: boolean },
  ): OperationRecommendationDecision {
    const recommendationLabels = decision.recommendationLabels.filter((label) => {
      if (label === '公共热度') return paths.publicHeat;
      if (label === '实时市场') return paths.hasRelatedMarket;
      return true;
    });
    if (paths.productValue && !recommendationLabels.includes('产品价值')) {
      recommendationLabels.unshift('产品价值');
    }

    const basis =
      decision.basis === 'heat' && !paths.publicHeat
        ? paths.hasRelatedMarket
          ? 'market'
          : 'product'
        : decision.basis === 'market' && !paths.hasRelatedMarket
          ? paths.productValue
            ? 'product'
            : 'product'
          : decision.basis;
    const needsDowngradeMarket =
      !paths.hasRelatedMarket &&
      (decision.predxOpportunity.associationLevel === 'L1_direct' ||
        decision.predxOpportunity.associationLevel === 'L2_analogous' ||
        decision.predxOpportunity.recommendedProductPage === 'market');

    return {
      ...decision,
      recommendationLabels: recommendationLabels.length
        ? recommendationLabels
        : [basis === 'heat' ? '公共热度' : basis === 'market' ? '实时市场' : '产品价值'],
      basis,
      angles: decision.angles.map((angle) => {
        const angleNeedsDowngrade =
          !paths.hasRelatedMarket &&
          (angle.level === 'L1_direct' ||
            angle.level === 'L2_analogous' ||
            angle.productUrl?.includes('/market'));
        return angleNeedsDowngrade
          ? {
              ...angle,
              level: 'L3_thematic',
              productUrl: 'https://predx.pro/news',
              riskNotes: [
                ...angle.riskNotes,
                '当前没有直接相关市场匹配，不能按实时市场路径表达。',
              ],
            }
          : angle;
      }),
      predxOpportunity: {
        ...decision.predxOpportunity,
        associationLevel: needsDowngradeMarket
          ? 'L3_thematic'
          : decision.predxOpportunity.associationLevel,
        recommendedProductPage: needsDowngradeMarket
          ? 'news'
          : decision.predxOpportunity.recommendedProductPage,
        recommendedProductUrl: needsDowngradeMarket
          ? 'https://predx.pro/news'
          : decision.predxOpportunity.recommendedProductUrl,
        urlReason: needsDowngradeMarket
          ? '当前没有直接相关市场匹配，先进入 PredX News 做事件承接。'
          : decision.predxOpportunity.urlReason,
      },
    };
  }

  private async loadProductReference(): Promise<string> {
    const path =
      this.configService.get<string>('PREDX_PRODUCT_REFERENCE_PATH') ??
      join(process.cwd(), '..', 'hotspot-monitor-doc', '_bmad-output', 'specs', 'predx-event-product-association-reference.md');
    return readFile(path, 'utf8').catch(() => '');
  }
}

function serializeEvent(event: Event): JsonObject {
  return {
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    summary: event.summary,
    occurredAt: event.occurredAt?.toISOString() ?? null,
    labels: (event.labels ?? null) as JsonValue,
    evidenceRefs: event.evidenceRefs as JsonValue,
    sourceSummary: event.sourceSummary as JsonValue,
    createdAt: event.createdAt.toISOString(),
  };
}

function withPublicHeatLabel(
  decision: OperationRecommendationDecision,
): OperationRecommendationDecision {
  if (decision.recommendationLabels.includes('公共热度')) {
    return decision;
  }

  return {
    ...decision,
    recommendationLabels: ['公共热度', ...decision.recommendationLabels],
    priority: 'immediate',
  };
}

function serializeNews(news: PredxNewsItem): JsonObject {
  return {
    id: news.id,
    externalId: news.externalId,
    title: news.title,
    newsTitle: news.newsTitle,
    sourceName: news.sourceName,
    sourceUrl: news.sourceUrl,
    category: news.category,
    publishedAt: news.publishedAt.toISOString(),
    primaryMarketTitle: news.primaryMarketTitle,
    primaryMarketUrl: news.primaryMarketUrl,
    relatedMarkets: news.relatedMarkets as JsonValue,
  };
}

function scoreTextOverlap(left: string, right: string): number {
  const tokens = new Set(tokenize(left));
  return tokenize(right).filter((token) => tokens.has(token)).length;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter((token) => token.length >= 3);
}

function newsHasMarket(news?: PredxNewsItem): boolean {
  return Boolean(news?.primaryMarketTitle && news.primaryMarketUrl);
}

function isRecent(date: Date, hours: number): boolean {
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function mapCategoryLabel(category: string): string {
  if (/geopolitic|military|war|conflict/i.test(category)) return 'Geopolitics & Conflict';
  if (/fiscal|trade|macro|financial|econom/i.test(category)) return 'Macro & Financial Markets';
  if (/crypto|web3/i.test(category)) return 'Crypto & Web3';
  if (/election|politic/i.test(category)) return 'Politics & Elections';
  return 'Prediction Markets';
}

const PRODUCT_VALUE_EVENT_LABELS = new Set([
  'AI',
  'Technology',
  'Politics & Elections',
  'Geopolitics & Conflict',
  'Macro & Financial Markets',
  'Crypto & Web3',
  'Prediction Markets',
  'Official Schedule',
]);

function mapEventLabelToPredxCategories(label: string): string[] {
  switch (label) {
    case 'Politics & Elections':
      return ['politic', 'election'];
    case 'Geopolitics & Conflict':
      return ['geopolitic', 'military', 'war', 'conflict'];
    case 'Macro & Financial Markets':
      return ['macro', 'financial', 'econom', 'trade', 'fiscal'];
    case 'Crypto & Web3':
      return ['crypto', 'web3'];
    case 'Prediction Markets':
      return ['prediction', 'market'];
    case 'AI':
    case 'Technology':
      return ['technology', 'ai'];
    case 'Official Schedule':
      return ['macro', 'financial', 'econom'];
    default:
      return [];
  }
}

function getProductValueLabels(event: Event, news?: PredxNewsItem): string[] {
  const labels = getLabelNames(event.labels).filter((label) =>
    PRODUCT_VALUE_EVENT_LABELS.has(label),
  );
  if (news?.category) {
    labels.push(mapCategoryLabel(news.category));
  }
  return labels;
}

function uniqueNewsItems(newsItems: PredxNewsItem[]): PredxNewsItem[] {
  const seen = new Set<string>();
  return newsItems.filter((news) => {
    if (seen.has(news.id)) {
      return false;
    }
    seen.add(news.id);
    return true;
  });
}

function getLabelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === 'string') return label;
      if (label && typeof label === 'object' && 'name' in label) {
        return String((label as { name?: unknown }).name ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .filter(Boolean)
    : [];
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeConfidence(
  value: unknown,
  fallback: OperationRecommendationDecision['confidence'],
): OperationRecommendationDecision['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : fallback;
}
