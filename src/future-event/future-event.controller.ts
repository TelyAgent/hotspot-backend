import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { parseTake } from '../common/utils/request.util';
import { FutureEventRepository } from './future-event.repository';
import { FutureEventMonitoringAgentService } from './monitoring/future-event-monitoring-agent.service';

@Controller('future-events')
export class FutureEventController {
  constructor(
    private readonly futureEventRepository: FutureEventRepository,
    private readonly monitoringAgentService: FutureEventMonitoringAgentService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('take') take?: string) {
    return this.futureEventRepository.listEvents({
      status,
      take: parseTake(take),
    });
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.futureEventRepository.createEvent({
      title: String(body.title),
      eventType: String(body.eventType),
      scheduledAt: body.scheduledAt ? new Date(String(body.scheduledAt)) : null,
      startAt: body.startAt ? new Date(String(body.startAt)) : null,
      endAt: body.endAt ? new Date(String(body.endAt)) : null,
      domains: Array.isArray(body.domains) ? body.domains : [],
      summary: body.summary ? String(body.summary) : null,
      whyItMatters: body.whyItMatters ? String(body.whyItMatters) : null,
      status: body.status === 'candidate' ? 'candidate' : 'confirmed',
      createdFrom: body.createdFrom ? String(body.createdFrom) : 'human',
      confidence: this.toConfidence(body.confidence),
      metadata:
        typeof body.metadata === 'object' && body.metadata !== null
          ? (body.metadata as JsonObject)
          : null,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.futureEventRepository.findEventById(id);
  }

  @Get(':id/monitoring-plans')
  listMonitoringPlans(@Param('id') id: string) {
    return this.futureEventRepository.listMonitoringPlans(id);
  }

  @Post(':id/monitoring-plans/generate')
  generateMonitoringPlan(@Param('id') id: string) {
    return this.monitoringAgentService.generateForEventId(id);
  }

  private toConfidence(value: unknown): 'high' | 'medium' | 'low' {
    if (value === 'high' || value === 'low') {
      return value;
    }

    return 'medium';
  }
}
