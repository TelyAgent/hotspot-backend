import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { TopicWatchSingleTriggerPolicy } from './topic-watch.types';
import { TopicCandidateDetailService } from './candidate-detail/topic-candidate-detail.service';
import { TopicWatchCollectionService } from './collection/topic-watch-collection.service';
import { TopicWatchAgentService } from './decision/topic-watch-agent.service';
import { TopicWatchPostLeaderboardService } from './leaderboard/topic-watch-post-leaderboard.service';
import { TopicWatchPipelineStatusService } from './status/topic-watch-pipeline-status.service';
import { TopicWatchRepository } from './topic-watch.repository';

@Controller('topic-watches')
export class TopicWatchController {
  constructor(
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly topicWatchAgentService: TopicWatchAgentService,
    private readonly topicWatchCollectionService: TopicWatchCollectionService,
    private readonly topicCandidateDetailService: TopicCandidateDetailService,
    private readonly topicWatchPostLeaderboardService: TopicWatchPostLeaderboardService,
    private readonly topicWatchPipelineStatusService: TopicWatchPipelineStatusService,
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

  @Get('status')
  status() {
    return this.topicWatchPipelineStatusService.getStatus();
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

  @Patch(':id/accounts')
  updateAccounts(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];

    return this.topicWatchRepository.updateTopicWatchAccounts(
      id,
      accounts
        .map((item, index) => normalizeAccountInput(item, index))
        .filter((item): item is NonNullable<ReturnType<typeof normalizeAccountInput>> => item !== null),
    );
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

  @Get(':id/post-leaderboard')
  async getPostLeaderboard(@Param('id') id: string) {
    const topicWatch = await this.topicWatchRepository.findTopicWatchById(id);
    if (!topicWatch) return null;

    return this.topicWatchPostLeaderboardService.getTopicLeaderboard({
      topicWatchId: topicWatch.id,
      topicWatchName: topicWatch.name,
    });
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

function normalizeAccountInput(value: unknown, index: number) {
  if (!isRecord(value)) return null;
  const handle = getString(value.handle);
  if (!handle) return null;
  const singleTriggerPolicy = getPolicy(value.singleTriggerPolicy);

  return {
    handle,
    primaryRole: getString(value.primaryRole) ?? '专业媒体、快速雷达、数据、分析、预测和观点账号',
    singleTriggerPolicy,
    authorityScope: getString(value.authorityScope) ?? '按账号公开信息与帖子内容判断',
    status: getString(value.status) === 'paused' ? 'paused' as const : 'active' as const,
    sortOrder: getNumber(value.sortOrder) ?? index + 1,
  };
}

function getPolicy(value: unknown): TopicWatchSingleTriggerPolicy {
  return value === 'S1' || value === 'S2' || value === 'C' ? value : 'C';
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
