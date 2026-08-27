import { Injectable } from '@nestjs/common';
import { EventLabel } from '../opportunity.types';

export const EVENT_DOMAIN_CODES = [
  'AI',
  'Technology',
  'Politics & Elections',
  'Geopolitics & Conflict',
  'Macro & Financial Markets',
  'Crypto & Web3',
  'Prediction Markets',
  'Official Schedule',
] as const;

export type EventDomainCode = (typeof EVENT_DOMAIN_CODES)[number];

interface DomainEvidence {
  id: string;
  sourceType: string;
  claim: string;
  text?: string | null;
  confidence: string;
}

export interface BuildDomainLabelsInput {
  evidence: DomainEvidence[];
  topicDomains?: string[];
  agentSuggestedDomains?: string[];
}

const DOMAIN_KEYWORDS: Record<EventDomainCode, string[]> = {
  AI: [
    'ai',
    'artificial intelligence',
    'llm',
    'openai',
    'anthropic',
    'claude',
    'gpt',
    'gemini',
    'nvidia',
    'gpu',
    '大模型',
    '人工智能',
    '芯片',
    '算力',
  ],
  Technology: [
    'technology',
    'software',
    'hardware',
    'cybersecurity',
    'developer',
    'api',
    'app',
    '平台',
    '软件',
    '硬件',
    '网络安全',
  ],
  'Politics & Elections': [
    'election',
    'campaign',
    'candidate',
    'poll',
    'vote',
    'senate',
    'congress',
    'president',
    '选举',
    '候选人',
    '民调',
    '国会',
    '总统',
  ],
  'Geopolitics & Conflict': [
    'war',
    'conflict',
    'ceasefire',
    'sanction',
    'military',
    'russia',
    'ukraine',
    'israel',
    '外交',
    '制裁',
    '战争',
    '冲突',
  ],
  'Macro & Financial Markets': [
    'cpi',
    'pce',
    'jobs report',
    'fomc',
    'fed',
    'rate cut',
    'inflation',
    'gdp',
    'treasury',
    '通胀',
    '非农',
    '美联储',
    '降息',
    '加息',
  ],
  'Crypto & Web3': [
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'solana',
    'stablecoin',
    'defi',
    'binance',
    'coinbase',
    '加密',
    '稳定币',
    '链上',
  ],
  'Prediction Markets': [
    'polymarket',
    'kalshi',
    'predictit',
    'metaculus',
    'prediction market',
    'odds',
    'probability',
    '预测市场',
    '概率',
    '赔率',
  ],
  'Official Schedule': [
    'official schedule',
    'calendar',
    'release calendar',
    'fomc meeting',
    'bea',
    'bls',
    '官方日程',
    '发布日历',
  ],
};

const OFFICIAL_SCHEDULE_SOURCE_TYPES = new Set([
  'fomc',
  'bea',
  'bls',
  'opm',
  'future_event_official_schedule',
]);

const MACRO_SCHEDULE_SOURCE_TYPES = new Set(['fomc', 'bea', 'bls']);

@Injectable()
export class EventDomainLabelService {
  buildDomainLabels(input: BuildDomainLabelsInput): EventLabel[] {
    const labels = new Map<EventDomainCode, EventLabel>();

    for (const evidence of input.evidence) {
      if (OFFICIAL_SCHEDULE_SOURCE_TYPES.has(evidence.sourceType)) {
        this.addLabel(labels, 'Official Schedule', [evidence.id], '证据来自官方日程来源。', 'high');
      }
      if (MACRO_SCHEDULE_SOURCE_TYPES.has(evidence.sourceType)) {
        this.addLabel(labels, 'Macro & Financial Markets', [evidence.id], '官方日程来源属于宏观经济与金融市场。', 'high');
      }
    }

    for (const domain of [
      ...(input.topicDomains ?? []),
      ...(input.agentSuggestedDomains ?? []),
    ]) {
      const code = normalizeDomain(domain);
      if (code) {
        this.addLabel(labels, code, [], `主题或 Agent 建议领域为 ${code}。`, 'medium');
      }
    }

    for (const domain of EVENT_DOMAIN_CODES) {
      const matchedEvidence = input.evidence.filter((item) =>
        matchesDomain(domain, `${item.claim}\n${item.text ?? ''}`),
      );
      if (matchedEvidence.length > 0) {
        this.addLabel(
          labels,
          domain,
          matchedEvidence.map((item) => item.id),
          '证据文本命中该固定领域。',
          'high',
        );
      }
    }

    return [...labels.values()];
  }

  private addLabel(
    labels: Map<EventDomainCode, EventLabel>,
    code: EventDomainCode,
    evidenceRefs: string[],
    reason: string,
    confidence: EventLabel['confidence'],
  ) {
    const existing = labels.get(code);
    labels.set(code, {
      code,
      name: code,
      category: 'domain',
      evidenceRefs: existing
        ? Array.from(new Set([...existing.evidenceRefs, ...evidenceRefs]))
        : evidenceRefs,
      reason: existing?.reason ?? reason,
      confidence: existing?.confidence === 'high' ? 'high' : confidence,
    });
  }
}

function normalizeDomain(value: string): EventDomainCode | null {
  const normalized = value.trim().toLowerCase();
  return (
    EVENT_DOMAIN_CODES.find((code) => code.toLowerCase() === normalized) ??
    null
  );
}

function matchesDomain(domain: EventDomainCode, value: string) {
  const normalized = value.toLowerCase();
  return DOMAIN_KEYWORDS[domain].some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
}
