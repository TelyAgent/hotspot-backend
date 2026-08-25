import { Injectable } from '@nestjs/common';
import {
  PostMetricSnapshot,
  StrategyFeedback,
} from '../performance.types';

@Injectable()
export class PerformanceFeedbackService {
  createFeedback(input: {
    publishedPostId: string;
    snapshot: PostMetricSnapshot;
  }): StrategyFeedback {
    if (input.snapshot.isMissingData) {
      return {
        publishedPostId: input.publishedPostId,
        feedbackType: 'missing_data',
        summary: '该发布链接指标缺失，需要如实展示并等待下次追踪。',
        evidence: {
          snapshotId: input.snapshot.id,
          observedAt: input.snapshot.observedAt.toISOString(),
          errorMessage: input.snapshot.errorMessage ?? null,
        },
      };
    }

    if ((input.snapshot.views ?? 0) >= 1000) {
      return {
        publishedPostId: input.publishedPostId,
        feedbackType: 'good_performance',
        summary: '该发布链接浏览量达到表现良好阈值。',
        evidence: {
          snapshotId: input.snapshot.id,
          views: input.snapshot.views ?? null,
          observedAt: input.snapshot.observedAt.toISOString(),
        },
      };
    }

    return {
      publishedPostId: input.publishedPostId,
      feedbackType: 'tracking_failed',
      summary: '该快照尚未形成正向表现反馈。',
      evidence: {
        snapshotId: input.snapshot.id,
        observedAt: input.snapshot.observedAt.toISOString(),
      },
    };
  }
}
