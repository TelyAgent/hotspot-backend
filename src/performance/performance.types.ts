import { JsonObject } from '../common/types/json.type';

export interface PublishedPost {
  id: string;
  contentTaskId: string;
  platform: string;
  url: string;
  publishedAt: Date;
  firstTrackedAt?: Date | null;
  lastTrackedAt?: Date | null;
  trackingStatus: 'active' | 'extended' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePublishedPostInput {
  contentTaskId: string;
  platform: string;
  url: string;
  publishedAt: Date;
}

export interface PostMetricSnapshot {
  id: string;
  publishedPostId: string;
  observedAt: Date;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  quotes?: number | null;
  views?: number | null;
  rawMetrics?: JsonObject | null;
  isMissingData: boolean;
  errorMessage?: string | null;
  createdAt: Date;
}

export interface CreatePostMetricSnapshotInput {
  publishedPostId: string;
  observedAt: Date;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  quotes?: number | null;
  views?: number | null;
  rawMetrics?: JsonObject | null;
  isMissingData?: boolean;
  errorMessage?: string | null;
}

export interface StrategyFeedback {
  publishedPostId: string;
  feedbackType: 'good_performance' | 'missing_data' | 'tracking_failed';
  summary: string;
  evidence: JsonObject;
}
