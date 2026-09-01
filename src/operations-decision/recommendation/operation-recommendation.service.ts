import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Event, PredxNewsItem } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { OperationsDecisionRepository } from '../operations-decision.repository';
import { OperationRecommendationDecision } from '../operations-decision.types';
import { PredxNewsClientService } from '../predx-news/predx-news-client.service';
import { OperationRecommendationAgentService } from './operation-recommendation-agent.service';

@Injectable()
export class OperationRecommendationService {
  constructor(
    private readonly repository: OperationsDecisionRepository,
    private readonly predxNewsClient: PredxNewsClientService,
    private readonly agent: OperationRecommendationAgentService,
    private readonly configService: ConfigService,
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
      if (!relatedNews.length) continue;

      const fallback = this.createFallbackDecision(event, relatedNews[0]);
      let decision = fallback;
      let agentRunId: string | undefined;

      if (this.configService.get<string>('OPENAI_API_KEY')) {
        const agentResult = await this.agent.decide({
          event: serializeEvent(event),
          predxNews: relatedNews.slice(0, 4).map(serializeNews),
          productReference,
        });
        if (agentResult.skipped) {
          continue;
        }
        if (agentResult.decision?.angles.length) {
          decision = agentResult.decision;
        }
        agentRunId = agentResult.agentRunId;
      }

      created.push(await this.repository.createRecommendation({
        sourceEventId: event.id,
        predxNewsItemId: relatedNews[0].id,
        decision,
        agentRunId,
      }));
    }

    return {
      syncedPredxNewsCount: synced.count,
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

  listInbox() {
    return this.repository.listInbox();
  }

  createInboxItem(input: { rawContent: string; source?: string; sourceUrl?: string }) {
    return this.repository.createInboxItem(input);
  }

  listRecords() {
    return this.repository.listRecords();
  }

  async adoptRecommendation(input: {
    recommendationId: string;
    angleId: string;
    operator?: string;
    note?: string;
  }) {
    const recommendation = await this.requireRecommendation(input.recommendationId);
    const angle = recommendation.angles.find((item) => item.id === input.angleId);
    if (!angle) {
      throw new DomainError('承接角度不存在。', 'OPERATION_RECOMMENDATION_ANGLE_NOT_FOUND', {
        recommendationId: input.recommendationId,
        angleId: input.angleId,
      });
    }

    return this.repository.recordRecommendationDecision({
      recommendationId: recommendation.id,
      result: 'adopted',
      recommendationStatus: 'adopted',
      finalAngle: angle.claim,
      operator: input.operator,
      note: input.note,
      metadata: {
        angleId: angle.id,
        sourceEventId: recommendation.sourceEventId,
        predxNewsItemId: recommendation.predxNewsItemId,
      },
    });
  }

  async adoptEditedRecommendation(input: {
    recommendationId: string;
    angleId?: string;
    finalAngle: string;
    operator?: string;
    note?: string;
  }) {
    const recommendation = await this.requireRecommendation(input.recommendationId);
    const finalAngle = input.finalAngle.trim();
    if (!finalAngle) {
      throw new DomainError('修改后的承接角度不能为空。', 'OPERATION_RECOMMENDATION_FINAL_ANGLE_REQUIRED');
    }
    const angle =
      input.angleId != null
        ? recommendation.angles.find((item) => item.id === input.angleId)
        : undefined;
    if (input.angleId && !angle) {
      throw new DomainError('承接角度不存在。', 'OPERATION_RECOMMENDATION_ANGLE_NOT_FOUND', {
        recommendationId: input.recommendationId,
        angleId: input.angleId,
      });
    }

    return this.repository.recordRecommendationDecision({
      recommendationId: recommendation.id,
      result: 'edited',
      recommendationStatus: 'adopted',
      finalAngle,
      operator: input.operator,
      note: input.note,
      metadata: {
        angleId: angle?.id ?? null,
        sourceEventId: recommendation.sourceEventId,
        predxNewsItemId: recommendation.predxNewsItemId,
      },
    });
  }

  async rejectRecommendation(input: {
    recommendationId: string;
    operator?: string;
    note?: string;
  }) {
    const recommendation = await this.requireRecommendation(input.recommendationId);
    return this.repository.recordRecommendationDecision({
      recommendationId: recommendation.id,
      result: 'rejected',
      recommendationStatus: 'rejected',
      finalAngle: null,
      operator: input.operator,
      note: input.note,
      metadata: {
        sourceEventId: recommendation.sourceEventId,
        predxNewsItemId: recommendation.predxNewsItemId,
      },
    });
  }

  private async requireRecommendation(id: string) {
    const recommendation = await this.repository.findRecommendationById(id);
    if (!recommendation) {
      throw new DomainError('选题推荐不存在。', 'OPERATION_RECOMMENDATION_NOT_FOUND', { id });
    }
    return recommendation;
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
          ? news.primaryMarketUrl ?? 'https://predx.pro/market'
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
    createdAt: event.createdAt.toISOString(),
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

function newsHasMarket(news: PredxNewsItem): boolean {
  return Boolean(news.primaryMarketTitle && news.primaryMarketUrl);
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
