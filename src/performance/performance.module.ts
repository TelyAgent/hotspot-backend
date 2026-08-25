import { Module } from '@nestjs/common';
import { PerformanceFeedbackService } from './feedback/performance-feedback.service';
import { PerformanceController } from './performance.controller';
import { PostMetricSnapshotRepository } from './tracking/post-metric-snapshot.repository';
import { PerformanceTrackingService } from './tracking/performance-tracking.service';
import { PublishedPostRepository } from './tracking/published-post.repository';

@Module({
  controllers: [PerformanceController],
  providers: [
    PublishedPostRepository,
    PostMetricSnapshotRepository,
    PerformanceTrackingService,
    PerformanceFeedbackService,
  ],
  exports: [PerformanceTrackingService, PerformanceFeedbackService],
})
export class PerformanceModule {}
