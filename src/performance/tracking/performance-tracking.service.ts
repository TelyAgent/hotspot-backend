import { Injectable } from '@nestjs/common';
import {
  CreatePostMetricSnapshotInput,
  CreatePublishedPostInput,
  PostMetricSnapshot,
  PublishedPost,
} from '../performance.types';
import { PostMetricSnapshotRepository } from './post-metric-snapshot.repository';
import { PublishedPostRepository } from './published-post.repository';

@Injectable()
export class PerformanceTrackingService {
  constructor(
    private readonly publishedPostRepository: PublishedPostRepository,
    private readonly metricSnapshotRepository: PostMetricSnapshotRepository,
  ) {}

  async backfillPublishedPost(
    input: CreatePublishedPostInput,
  ): Promise<PublishedPost> {
    return this.publishedPostRepository.create(input);
  }

  async recordMetricSnapshot(
    input: CreatePostMetricSnapshotInput,
  ): Promise<PostMetricSnapshot> {
    return this.metricSnapshotRepository.create(input);
  }

  getNextTrackingDelayHours(input: {
    publishedAt: Date;
    now: Date;
  }): number {
    const ageHours =
      (input.now.getTime() - input.publishedAt.getTime()) / 60 / 60 / 1000;

    return ageHours <= 24 ? 2 : 5;
  }

  shouldExtendTracking(input: {
    publishedAt: Date;
    snapshot: PostMetricSnapshot;
    viewThreshold?: number;
    windowHours?: number;
  }): boolean {
    const viewThreshold = input.viewThreshold ?? 1000;
    const windowHours = input.windowHours ?? 48;
    const ageHours =
      (input.snapshot.observedAt.getTime() - input.publishedAt.getTime()) /
      60 /
      60 /
      1000;

    return (
      ageHours <= windowHours &&
      typeof input.snapshot.views === 'number' &&
      input.snapshot.views >= viewThreshold
    );
  }
}
