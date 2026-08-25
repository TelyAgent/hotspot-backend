import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { TopicWatchAgentService } from './decision/topic-watch-agent.service';
import { TopicWatchRepository } from './topic-watch.repository';

@Controller('topic-watches')
export class TopicWatchController {
  constructor(
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly topicWatchAgentService: TopicWatchAgentService,
  ) {}

  @Get()
  list() {
    return this.topicWatchRepository.listTopicWatches();
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.topicWatchRepository.createTopicWatch({
      name: String(body.name),
      description: String(body.description ?? ''),
      domains: Array.isArray(body.domains) ? body.domains.map(String) : [],
      watchIntent: String(body.watchIntent ?? ''),
      collectionPolicy: String(body.collectionPolicy ?? ''),
      triggerPolicy: String(body.triggerPolicy ?? ''),
      evidencePolicy: String(body.evidencePolicy ?? ''),
      exclusionPolicy: body.exclusionPolicy
        ? String(body.exclusionPolicy)
        : null,
      status: body.status === 'paused' ? 'paused' : 'active',
      ownerId: body.ownerId ? String(body.ownerId) : null,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.topicWatchRepository.findTopicWatchById(id);
  }

  @Get(':id/candidates')
  listCandidates(@Param('id') id: string) {
    return this.topicWatchRepository.listCandidates(id);
  }

  @Post(':id/evaluate')
  async evaluate(@Param('id') id: string) {
    const topicWatch = await this.topicWatchRepository.findTopicWatchById(id);
    const candidates = await this.topicWatchRepository.listCandidates(id);

    if (!topicWatch) {
      return null;
    }

    return this.topicWatchAgentService.evaluate({
      topicWatch,
      candidates,
    });
  }

  @Get(':id/decisions')
  listDecisions(@Param('id') id: string) {
    return this.topicWatchRepository.listDecisions(id);
  }

  @Post(':id/monitoring-plans')
  listMonitoringPlans(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.topicWatchRepository.createMonitoringPlan({
      topicWatchId: id,
      version: Number(body.version ?? 1),
      sources: Array.isArray(body.sources) ? body.sources : [],
      triggerRules: Array.isArray(body.triggerRules) ? body.triggerRules : [],
      evidenceRequirements: Array.isArray(body.evidenceRequirements)
        ? body.evidenceRequirements
        : [],
      refreshPolicy:
        typeof body.refreshPolicy === 'object' && body.refreshPolicy !== null
          ? (body.refreshPolicy as JsonObject)
          : {},
      generatedBy: body.generatedBy === 'agent' ? 'agent' : 'human',
      reason: String(body.reason ?? ''),
      status: body.status ? String(body.status) : 'draft',
    });
  }
}
