import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OperationRecommendationService } from './recommendation/operation-recommendation.service';

@Controller('operations-decision')
export class OperationsDecisionController {
  constructor(
    private readonly recommendationService: OperationRecommendationService,
  ) {}

  @Get('predx-news')
  listPredxNews(@Query('take') take?: string) {
    return this.recommendationService.listPredxNewsItems({
      take: parsePositiveInt(take, 20),
    });
  }

  @Post('predx-news/sync')
  syncPredxNews(@Body() body: Record<string, unknown>) {
    return this.recommendationService.syncPredxNews({
      pageSize: parsePositiveInt(body.pageSize, 20),
      index: parsePositiveInt(body.index, 0),
    });
  }

  @Get('recommendations')
  listRecommendations(
    @Query('basis') basis?: string,
    @Query('priority') priority?: string,
    @Query('take') take?: string,
  ) {
    return this.recommendationService.listRecommendations({
      basis,
      priority,
      take: parsePositiveInt(take, 50),
    });
  }

  @Get('recommendations/:id')
  findRecommendation(@Param('id') id: string) {
    return this.recommendationService.findRecommendationById(id);
  }

  @Post('recommendations/run')
  runRecommendations(@Body() body: Record<string, unknown>) {
    return this.recommendationService.generate({
      eventTake: parsePositiveInt(body.eventTake, 20),
      newsTake: parsePositiveInt(body.newsTake, 20),
    });
  }

  @Get('inbox')
  listInbox() {
    return this.recommendationService.listInbox();
  }

  @Post('inbox')
  createInboxItem(@Body() body: Record<string, unknown>) {
    return this.recommendationService.createInboxItem({
      rawContent: String(body.rawContent ?? ''),
      source: typeof body.source === 'string' ? body.source : undefined,
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
    });
  }
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
