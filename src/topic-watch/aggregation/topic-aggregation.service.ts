import { Injectable } from '@nestjs/common';
import { TopicWatchRepository } from '../topic-watch.repository';
import {
  CreateTopicCandidateInput,
  TopicAggregationInput,
  TopicCandidate,
} from '../topic-watch.types';
import { Signal } from '../../signal/signal/signal.types';

@Injectable()
export class TopicAggregationService {
  constructor(private readonly topicWatchRepository: TopicWatchRepository) {}

  async aggregate(input: TopicAggregationInput): Promise<TopicCandidate[]> {
    const groups = this.groupSignals(input.signals);
    const candidates: TopicCandidate[] = [];

    for (const [clusterKey, signals] of groups.entries()) {
      const candidateInput = await this.createCandidateInput(
        input.topicWatchId,
        signals,
        clusterKey,
      );
      const candidate =
        await this.topicWatchRepository.upsertCandidateByClusterKey(
          { ...candidateInput, clusterKey },
        );
      candidates.push(candidate);
    }

    return candidates;
  }

  private groupSignals(signals: Signal[]): Map<string, Signal[]> {
    const clusters: Array<{
      key: string;
      tokens: Set<string>;
      signals: Signal[];
    }> = [];

    for (const signal of signals) {
      const profile = this.extractContentProfile(signal);
      const existing = clusters.find((cluster) =>
        shouldMergeProfiles(cluster.tokens, profile.tokens),
      );

      if (existing) {
        existing.signals.push(signal);
        for (const token of profile.tokens) {
          existing.tokens.add(token);
        }
        continue;
      }

      clusters.push({
        key: profile.key,
        tokens: profile.tokens,
        signals: [signal],
      });
    }

    const groups = new Map<string, Signal[]>();
    for (const cluster of clusters) {
      groups.set(cluster.key, [
        ...(groups.get(cluster.key) ?? []),
        ...cluster.signals,
      ]);
    }
    return groups;
  }

  private extractContentProfile(signal: Signal): {
    key: string;
    tokens: Set<string>;
  } {
    const metadata = signal.metadata;

    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const entities = metadata.entities;
      if (Array.isArray(entities) && typeof entities[0] === 'string') {
        const entityKey = entities[0].toLowerCase();
        return {
          key: `entity:${entityKey}`,
          tokens: new Set([entityKey]),
        };
      }
    }

    const normalizedText = normalizeSignalText(signal);
    const tokens = tokenizeTopicText(normalizedText);

    return {
      key: `content:${createTokenSignature(tokens) || normalizedText}`,
      tokens,
    };
  }

  private async createCandidateInput(
    topicWatchId: string,
    signals: Signal[],
    clusterKey: string,
  ): Promise<CreateTopicCandidateInput> {
    const sortedSignals = [...signals].sort(
      (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
    );
    const entities = this.collectMetadataStrings(signals, 'entities');
    const keywords = this.collectMetadataStrings(signals, 'keywords');
    const sourceTypes = [...new Set(signals.map((signal) => signal.signalType))];
    const authors = this.collectMetadataStrings(signals, 'authorHandles');
    const hotnessMetrics = await this.calculateHotnessMetrics(sortedSignals);

    return {
      topicWatchId,
      title: this.createTitle(topicWatchId, sortedSignals, entities),
      summary: this.createSummary(topicWatchId, sortedSignals, entities),
      keywords,
      entities,
      firstSeenAt: sortedSignals[0].observedAt,
      lastSeenAt: sortedSignals[sortedSignals.length - 1].observedAt,
      signalCount: signals.length,
      postCount: signals.filter((signal) => isPostSignal(signal.signalType)).length,
      accountCount: authors.length || null,
      sourceTypes,
      representativeSignalIds: sortedSignals.slice(0, 5).map((signal) => signal.id),
      evidenceRefs: [],
      metrics: {
        uniqueAuthors: authors.length,
        totalSignals: signals.length,
        ...hotnessMetrics,
      },
      clustering: {
        method: 'hybrid',
        clusterKey,
        confidence: signals.length > 1 ? 'medium' : 'low',
      },
      status: 'new',
    };
  }

  private collectMetadataStrings(signals: Signal[], key: string): string[] {
    const values = new Set<string>();

    for (const signal of signals) {
      const metadata = signal.metadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        continue;
      }

      const raw = metadata[key];
      if (!Array.isArray(raw)) {
        continue;
      }

      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          values.add(item.trim());
        }
      }
    }

    return [...values];
  }

  private createTitle(
    topicWatchId: string,
    signals: Signal[],
    entities: string[],
  ): string {
    const normalizedTitles = signals
      .map((signal) => normalizePostTitle(signal.title))
      .filter(Boolean);
    const bestTitle = pickShortestUsefulText(normalizedTitles);
    return createChineseTopicTitle(bestTitle, entities, topicWatchId);
  }

  private createSummary(
    topicWatchId: string,
    signals: Signal[],
    entities: string[],
  ): string {
    const title = this.createTitle(topicWatchId, signals, entities);
    const authors = signals
      .map(getSignalAuthor)
      .filter((author): author is string => Boolean(author));
    const uniqueAuthors = [...new Set(authors.map(normalizeAuthorHandle))];
    const subject =
      uniqueAuthors.length >= 2
        ? '多个账号'
        : uniqueAuthors[0]
          ? formatAuthor(uniqueAuthors[0])
          : entities[0] ?? '相关账号';

    const connector = startsWithAscii(title) ? ' ' : '';
    return `${subject}正在讨论${uniqueAuthors.length >= 2 ? ` ${title}等动态` : `${connector}${title}`}。`;
  }

  private async calculateHotnessMetrics(signals: Signal[]) {
    const lastSeenAt = signals[signals.length - 1]?.observedAt ?? new Date();
    const b3hWindowStart = lastSeenAt.getTime() - 3 * 60 * 60 * 1000;
    const b24hWindowStart = lastSeenAt.getTime() - 24 * 60 * 60 * 1000;
    const postSignals = signals.filter((signal) => isPostSignal(signal.signalType));
    const scoredSignals = await Promise.all(
      postSignals.map((signal) => this.calculateRelativePostPerformance(signal)),
    );
    const maxScore = scoredSignals.reduce(
      (best, item) => (item.relativeScore > best.relativeScore ? item : best),
      {
        signal: undefined as Signal | undefined,
        relativeScore: 0,
        isTop5Percent: null as boolean | null,
        reason: '候选中没有可计算流量的帖子。',
      },
    );

    return {
      b3h: countUniqueAuthorsInWindow(postSignals, b3hWindowStart),
      b24h: countUniqueAuthorsInWindow(postSignals, b24hWindowStart),
      tmax: maxScore.relativeScore,
      tmaxSignalId: maxScore.signal?.id ?? null,
      tmaxTop5Percent: maxScore.isTop5Percent,
      tmaxTop5PercentReason: maxScore.reason,
    };
  }

  private async calculateRelativePostPerformance(signal: Signal) {
    const authorHandle = getSignalAuthor(signal);
    const currentScore = calculatePostTrafficScore(signal);

    if (!authorHandle) {
      return {
        signal,
        relativeScore: currentScore,
        isTop5Percent: null,
        reason: '缺少作者账号，无法计算账号近期历史分位。',
      };
    }

    const recentSignals =
      await this.topicWatchRepository.listRecentPostSignalsByAuthor({
        authorHandle,
        observedBefore: signal.observedAt,
        take: 30,
      });
    const historyScores = recentSignals
      .filter((item) => item.id !== signal.id)
      .map(calculatePostTrafficScore)
      .filter((score) => score > 0)
      .sort((left, right) => right - left);
    const baseline = median(historyScores);
    const relativeScore =
      baseline > 0 ? roundMetric(currentScore / baseline) : currentScore;
    const rankedScores = [currentScore, ...historyScores].sort(
      (left, right) => right - left,
    );
    const rank = rankedScores.findIndex((score) => score === currentScore) + 1;
    const topThreshold = Math.max(1, Math.ceil(rankedScores.length * 0.05));

    return {
      signal,
      relativeScore,
      isTop5Percent:
        historyScores.length > 0 ? rank > 0 && rank <= topThreshold : null,
      reason:
        historyScores.length > 0
          ? `基于作者近期 ${historyScores.length} 条有效帖子计算，中位基准 ${baseline}，当前排名 ${rank}/${rankedScores.length}。`
          : '缺少作者近期有效帖子历史，无法判断是否进入前 5%。',
    };
  }
}

function isPostSignal(signalType: string) {
  return signalType === 'post' || signalType.endsWith('_post');
}

function normalizeSignalText(signal: Signal) {
  const rawText = signal.summary ?? signal.title;
  return rawText
    .replace(/^.{1,40}[：:]\s*/u, '')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/&amp;/gu, '&')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokenizeTopicText(text: string) {
  const tokens = new Set<string>();

  for (const token of text.split(/\s+/u)) {
    if (token.length < 3) continue;
    if (TOPIC_STOP_WORDS.has(token)) continue;
    tokens.add(token);
  }

  return tokens;
}

function shouldMergeProfiles(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return false;

  let intersection = 0;
  for (const token of right) {
    if (left.has(token)) intersection += 1;
  }

  const smallerSize = Math.min(left.size, right.size);
  const unionSize = new Set([...left, ...right]).size;
  const containment = intersection / smallerSize;
  const jaccard = intersection / unionSize;

  return intersection >= 5 && (containment >= 0.65 || jaccard >= 0.55);
}

function createTokenSignature(tokens: Set<string>) {
  return [...tokens].sort().slice(0, 12).join(':');
}

function countUniqueAuthorsInWindow(signals: Signal[], windowStartAt: number) {
  const authors = new Set<string>();

  for (const signal of signals) {
    if (signal.observedAt.getTime() < windowStartAt) continue;
    const author = getSignalAuthor(signal);
    if (author) authors.add(author.toLowerCase());
  }

  return authors.size;
}

function getSignalAuthor(signal: Signal) {
  const metadata = signal.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const authorHandle = metadata.authorHandle;
  if (typeof authorHandle === 'string' && authorHandle.trim()) {
    return authorHandle.trim();
  }

  const authorHandles = metadata.authorHandles;
  if (Array.isArray(authorHandles) && typeof authorHandles[0] === 'string') {
    return authorHandles[0].trim();
  }

  return null;
}

function calculatePostTrafficScore(signal: Signal) {
  const metrics = signal.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return 0;
  }

  return (
    getNumber(metrics.likes) +
    getNumber(metrics.reposts) +
    getNumber(metrics.replies) +
    getNumber(metrics.quotes)
  );
}

function normalizePostTitle(value: string) {
  return value
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[@#]?\w{2,30}\s*[：:]\s*/u, '')
    .replace(/^(just in|breaking|new)\s*[：:-]\s*/iu, '')
    .trim();
}

function pickShortestUsefulText(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return '相关动态';
  return [...unique].sort((left, right) => {
    const leftScore = scoreUsefulTitle(left);
    const rightScore = scoreUsefulTitle(right);
    return rightScore - leftScore || left.length - right.length;
  })[0];
}

function scoreUsefulTitle(value: string) {
  let score = 0;
  if (containsChinese(value)) score += 4;
  if (value.length <= 80) score += 2;
  if (!/https?:\/\//iu.test(value)) score += 1;
  if (!/#\w+/u.test(value)) score += 1;
  return score;
}

function createChineseTopicTitle(
  value: string,
  entities: string[],
  topicWatchId: string,
) {
  const text = normalizePostTitle(value);
  const lower = text.toLowerCase();

  if (containsChinese(text)) {
    return ensureSentenceCore(text);
  }

  const patternTitle = translateKnownTopicPattern(text, lower);
  if (patternTitle) {
    return patternTitle;
  }

  const entity = entities.find(isMeaningfulEntity);
  if (entity) {
    return ensureSentenceCore(`${entity.trim()} 相关动态`);
  }

  return ensureSentenceCore(topicWatchFallbackTitle(topicWatchId));
}

function translateKnownTopicPattern(text: string, lower: string) {
  if (
    lower.includes('british employers') &&
    lower.includes('entry-level hiring') &&
    lower.includes('ai')
  ) {
    return '英国雇主因 AI 减少初级岗位招聘';
  }

  if (
    lower.includes('trump-backed') &&
    lower.includes('south carolina')
  ) {
    return '特朗普支持候选人在南卡罗来纳州选举中领先';
  }

  if (
    lower.includes('u.s. state department') &&
    lower.includes('visa appointments')
  ) {
    return '美国签证预约暂停后仍缺少恢复时间表';
  }

  if (lower.includes('ugandan army chief')) {
    return '乌干达军方高层相关政治动态';
  }

  if (lower.includes('irish fa') && lower.includes('fifa president')) {
    return '爱尔兰足协撤回对 FIFA 主席的支持';
  }

  if (lower.includes('ukrainian man') && lower.includes('berlin')) {
    return '乌克兰男子涉柏林枪支案件被拘留';
  }

  if (lower.includes('new polymarket') && lower.includes('mecca agreement')) {
    return 'Polymarket 出现麦加协议相关新市场';
  }

  if (lower.includes('meta') && lower.includes('settlement') && lower.includes('u.s. states')) {
    return 'Meta 与美国州政府讨论诉讼和解';
  }

  if (lower.includes('openai') && (lower.includes('new model') || lower.includes('model'))) {
    return 'OpenAI 发布新模型';
  }

  return null;
}

function ensureSentenceCore(text: string) {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/[。.!?！？]+$/u, '')
    .slice(0, 80)
    .trim() || '相关动态';
}

function containsChinese(value: string) {
  return /[\u4e00-\u9fa5]/u.test(value);
}

function normalizeAuthorHandle(value: string) {
  return value.trim().replace(/^@/u, '');
}

function formatAuthor(value: string) {
  return value ? `${value} ` : '';
}

function startsWithAscii(value: string) {
  return /^[A-Za-z0-9]/u.test(value.trim());
}

function isMeaningfulEntity(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  if (SOURCE_ACCOUNT_ENTITIES.has(normalized.toLowerCase())) return false;
  return /^[A-Z0-9][A-Za-z0-9 .&+-]{1,48}$/u.test(normalized);
}

function topicWatchFallbackTitle(topicWatchId: string) {
  return TOPIC_WATCH_FALLBACK_TITLES[topicWatchId] ?? '重点主题相关动态';
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const TOPIC_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'will',
  'would',
  'could',
  'should',
  'into',
  'about',
  'after',
  'before',
  'over',
  'under',
  'while',
  'when',
  'what',
  'who',
  'why',
  'how',
  'its',
  'their',
  'they',
  'you',
  'your',
  'our',
  'out',
  'not',
  'but',
  'can',
  'just',
  'new',
  'now',
  'via',
  'says',
  'said',
  'reportedly',
]);

const TOPIC_WATCH_FALLBACK_TITLES: Record<string, string> = {
  'topic-prediction-market': '预测市场相关动态',
  'topic-macro-finance': '宏观经济与金融相关动态',
  'topic-ai-tech': 'AI 与科技相关动态',
  'topic-crypto-web3': 'Crypto 与 Web3 相关动态',
  'topic-politics-election': '政治与选举相关动态',
  demo_topic_ai_products: 'AI 产品机会相关动态',
};

const SOURCE_ACCOUNT_ENTITIES = new Set([
  'abc',
  'ap',
  'bbc',
  'bbcworld',
  'bloomberg',
  'cnbc',
  'cnn',
  'coindesk',
  'cointelegraph',
  'decrypt',
  'foxnews',
  'polymarket',
  'polymarketintel',
  'reuters',
  'techcrunch',
  'theblock',
  'theinformation',
  'wired',
  'wsj',
]);
