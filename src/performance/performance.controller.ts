import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { InsightsService } from './insights/insights.service';
import { OverviewService } from './overview/overview.service';
import { PostMetricSnapshotRepository } from './tracking/post-metric-snapshot.repository';
import { PublishedPostRepository } from './tracking/published-post.repository';
import { PerformanceTrackingService } from './tracking/performance-tracking.service';

@Controller()
export class PerformanceController {
  constructor(
    private readonly performanceTrackingService: PerformanceTrackingService,
    private readonly publishedPostRepository: PublishedPostRepository,
    private readonly metricSnapshotRepository: PostMetricSnapshotRepository,
    private readonly insightsService: InsightsService,
    private readonly overviewService: OverviewService,
  ) {}

  @Get('overview')
  getOverview(@Query('range') range?: string) {
    return this.overviewService.getOverview({ range });
  }

  @Get('insights')
  getInsights(@Query('range') range?: string) {
    return this.insightsService.getInsights({ range });
  }

  @Post('published-posts')
  backfillPublishedPost(@Body() body: Record<string, unknown>) {
    return this.performanceTrackingService.backfillPublishedPost({
      contentTaskId: String(body.contentTaskId),
      accountId: body.accountId ? String(body.accountId) : null,
      accountName: body.accountName ? String(body.accountName) : null,
      platform: String(body.platform),
      url: String(body.url),
      publishedAt: body.publishedAt
        ? new Date(String(body.publishedAt))
        : new Date(),
    });
  }

  @Get('content-tasks/:id/published-posts')
  listPublishedPosts(@Param('id') id: string) {
    return this.publishedPostRepository.listByContentTask(id);
  }

  @Post('published-posts/:id/metric-snapshots')
  recordMetricSnapshot(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.performanceTrackingService.recordMetricSnapshot({
      publishedPostId: id,
      observedAt: body.observedAt ? new Date(String(body.observedAt)) : new Date(),
      likes: this.toOptionalNumber(body.likes),
      replies: this.toOptionalNumber(body.replies),
      reposts: this.toOptionalNumber(body.reposts),
      quotes: this.toOptionalNumber(body.quotes),
      views: this.toOptionalNumber(body.views),
      rawMetrics:
        typeof body.rawMetrics === 'object' && body.rawMetrics !== null
          ? (body.rawMetrics as JsonObject)
          : null,
      isMissingData: body.isMissingData === true,
      errorMessage: body.errorMessage ? String(body.errorMessage) : null,
    });
  }

  @Get('published-posts/:id/metric-snapshots')
  listMetricSnapshots(@Param('id') id: string) {
    return this.metricSnapshotRepository.listByPublishedPost(id);
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }

    return Number.isFinite(value) ? value : undefined;
  }
}
