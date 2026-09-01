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

  @Post('recommendations/:id/adopt')
  adoptRecommendation(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.recommendationService.adoptRecommendation({
      recommendationId: id,
      angleId: String(body.angleId ?? ''),
      operator: typeof body.operator === 'string' ? body.operator : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
  }

  @Post('recommendations/:id/adopt-edited')
  adoptEditedRecommendation(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.recommendationService.adoptEditedRecommendation({
      recommendationId: id,
      angleId: typeof body.angleId === 'string' ? body.angleId : undefined,
      finalAngle: String(body.finalAngle ?? ''),
      operator: typeof body.operator === 'string' ? body.operator : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
  }

  @Post('recommendations/:id/reject')
  rejectRecommendation(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.recommendationService.rejectRecommendation({
      recommendationId: id,
      operator: typeof body.operator === 'string' ? body.operator : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
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

  @Get('records')
  listRecords() {
    return this.recommendationService.listRecords();
  }
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
