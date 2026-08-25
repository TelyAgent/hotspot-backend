import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { TopicCandidateDetailService } from './candidate-detail/topic-candidate-detail.service';
import { TopicWatchCollectionService } from './collection/topic-watch-collection.service';
import { TopicWatchAgentService } from './decision/topic-watch-agent.service';
import { TopicWatchRepository } from './topic-watch.repository';

@Controller('topic-watches')
export class TopicWatchController {
  constructor(
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly topicWatchAgentService: TopicWatchAgentService,
    private readonly topicWatchCollectionService: TopicWatchCollectionService,
    private readonly topicCandidateDetailService: TopicCandidateDetailService,
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

  @Post('collect')
  collect() {
    return this.topicWatchCollectionService.collect({});
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.topicWatchRepository.findTopicWatchById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.topicWatchRepository.updateTopicWatch(id, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string'
        ? { description: body.description }
        : {}),
      ...(Array.isArray(body.domains)
        ? { domains: body.domains.map(String) }
        : {}),
      ...(typeof body.watchIntent === 'string'
        ? { watchIntent: body.watchIntent }
        : {}),
      ...(typeof body.collectionPolicy === 'string'
        ? { collectionPolicy: body.collectionPolicy }
        : {}),
      ...(typeof body.triggerPolicy === 'string'
        ? { triggerPolicy: body.triggerPolicy }
        : {}),
      ...(typeof body.evidencePolicy === 'string'
        ? { evidencePolicy: body.evidencePolicy }
        : {}),
      ...(typeof body.exclusionPolicy === 'string' || body.exclusionPolicy === null
        ? { exclusionPolicy: body.exclusionPolicy }
        : {}),
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
    });
  }

  @Post(':id/collect')
  collectOne(@Param('id') id: string) {
    return this.topicWatchCollectionService.collect({
      topicWatchId: id,
    });
  }

  @Patch(':id/monitoring-plans/active')
  updateActiveMonitoringPlan(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.topicWatchRepository.updateActiveMonitoringPlan(id, {
      ...(Array.isArray(body.sources)
        ? { sources: body.sources as JsonObject[] }
        : {}),
      ...(Array.isArray(body.triggerRules)
        ? { triggerRules: body.triggerRules as JsonObject[] }
        : {}),
      ...(Array.isArray(body.evidenceRequirements)
        ? { evidenceRequirements: body.evidenceRequirements as JsonObject[] }
        : {}),
      ...(typeof body.refreshPolicy === 'object' && body.refreshPolicy !== null
        ? { refreshPolicy: body.refreshPolicy as JsonObject }
        : {}),
      ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
    });
  }

  @Get(':id/monitoring-plans')
  listMonitoringPlans(@Param('id') id: string) {
    return this.topicWatchRepository.listMonitoringPlans(id);
  }

  @Post(':id/monitoring-plans/generate')
  async generateMonitoringPlan(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const topicWatch = await this.topicWatchRepository.findTopicWatchById(id);
    if (!topicWatch) {
      return null;
    }

    return this.topicWatchAgentService.generateMonitoringPlan({
      topicWatch,
      activate: body.activate === true,
    });
  }

  @Post(':id/monitoring-plans/:planId/activate')
  activateMonitoringPlan(@Param('id') id: string, @Param('planId') planId: string) {
    return this.topicWatchRepository.activateMonitoringPlan(id, planId);
  }

  @Get(':id/candidates')
  listCandidates(@Param('id') id: string) {
    return this.topicWatchRepository.listCandidates(id);
  }

  @Get(':id/candidates/:candidateId/posts')
  listCandidatePosts(
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.topicCandidateDetailService.listCandidatePosts({
      topicWatchId: id,
      candidateId,
    });
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
  createMonitoringPlan(@Param('id') id: string, @Body() body: Record<string, unknown>) {
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
