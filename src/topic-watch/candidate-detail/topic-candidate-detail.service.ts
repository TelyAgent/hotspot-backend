import { Injectable } from '@nestjs/common';
import { JsonValue } from '../../common/types/json.type';
import { Signal } from '../../signal/signal/signal.types';
import { TopicWatchRepository } from '../topic-watch.repository';

export interface TopicCandidatePost {
  postId: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  url: string | null;
  postType: string | null;
  publishedAt: string;
  metrics: {
    views?: number;
    likes?: number;
    replies?: number;
    reposts?: number;
    quotes?: number;
  } | null;
}

interface EvidenceLike {
  signalId?: string | null;
  sourceItemId?: string | null;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  metrics?: JsonValue | null;
  metadata?: JsonValue | null;
}

@Injectable()
export class TopicCandidateDetailService {
  constructor(private readonly topicWatchRepository: TopicWatchRepository) {}

  async listCandidatePosts(input: {
    topicWatchId: string;
    candidateId: string;
  }): Promise<TopicCandidatePost[]> {
    const candidate = await this.topicWatchRepository.findCandidateById(input);
    if (!candidate) return [];

    const signalIds = candidate.representativeSignalIds.filter(Boolean);
    const [signals, evidenceItems] = await Promise.all([
      this.topicWatchRepository.listSignalsByIds(signalIds),
      this.topicWatchRepository.listEvidenceBySignalIds(signalIds),
    ]);
    const evidenceBySignalId = new Map<string, EvidenceLike>();

    for (const evidence of evidenceItems as EvidenceLike[]) {
      if (evidence.signalId && !evidenceBySignalId.has(evidence.signalId)) {
        evidenceBySignalId.set(evidence.signalId, evidence);
      }
    }

    const posts = signalIds
      .map((signalId) => {
        const signal = signals.find((item) => item.id === signalId);
        if (!signal) return null;
        return {
          post: this.toPost(signal, evidenceBySignalId.get(signal.id)),
          observedAt: signal.observedAt,
        };
      })
      .filter(
        (item): item is { post: TopicCandidatePost; observedAt: Date } =>
          Boolean(item),
      );

    return uniqueLatestPosts(posts);
  }

  private toPost(signal: Signal, evidence?: EvidenceLike): TopicCandidatePost {
    const signalMetadata = toObject(signal.metadata);
    const evidenceMetadata = toObject(evidence?.metadata);
    const metrics = toMetricObject(evidence?.metrics) ?? toMetricObject(signal.metrics);
    const publishedAt =
      evidence?.publishedAt?.toISOString() ??
      getString(evidenceMetadata.publishedAt) ??
      getString(signalMetadata.publishedAt) ??
      signal.observedAt.toISOString();

    return {
      postId:
        getString(evidenceMetadata.postId) ??
        getString(signalMetadata.postId) ??
        evidence?.sourceItemId ??
        signal.id,
      authorHandle:
        getString(evidenceMetadata.authorHandle) ??
        getString(signalMetadata.authorHandle) ??
        evidence?.author ??
        'unknown',
      authorName:
        getString(evidenceMetadata.authorName) ??
        getString(signalMetadata.authorName) ??
        null,
      text: evidence?.text ?? signal.summary ?? signal.title,
      url:
        evidence?.url ??
        getString(evidenceMetadata.url) ??
        getString(signalMetadata.url) ??
        null,
      postType:
        getString(evidenceMetadata.postType) ??
        getString(signalMetadata.postType) ??
        null,
      publishedAt,
      metrics,
    };
  }
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toMetricObject(value: unknown): TopicCandidatePost['metrics'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    views: getNumber(raw.views),
    likes: getNumber(raw.likes),
    replies: getNumber(raw.replies),
    reposts: getNumber(raw.reposts),
    quotes: getNumber(raw.quotes),
  };
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function uniqueLatestPosts(
  items: Array<{ post: TopicCandidatePost; observedAt: Date }>,
) {
  const latestByPostKey = new Map<
    string,
    { post: TopicCandidatePost; observedAt: Date }
  >();

  for (const item of items) {
    const key = getPostKey(item.post);
    const current = latestByPostKey.get(key);
    if (!current || item.observedAt.getTime() >= current.observedAt.getTime()) {
      latestByPostKey.set(key, item);
    }
  }

  return [...latestByPostKey.values()]
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())
    .map((item) => item.post);
}

function getPostKey(post: TopicCandidatePost) {
  if (post.postId && post.postId !== 'unknown') {
    return `post:${post.postId}`;
  }

  if (post.url) {
    return `url:${post.url}`;
  }

  return `text:${post.authorHandle}:${post.text}`;
}
