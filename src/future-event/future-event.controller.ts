import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JsonObject } from '../common/types/json.type';
import { parseTake } from '../common/utils/request.util';
import { FutureEventCandidateService } from './candidate/future-event-candidate.service';
import { FutureEventRepository } from './future-event.repository';
import { FutureEvent, FutureEventCandidate } from './future-event.types';
import { FutureEventMonitoringAgentService } from './monitoring/future-event-monitoring-agent.service';
import { FutureEventMonitoringExecutionService } from './monitoring/future-event-monitoring-execution.service';
import { FutureEventActionScoreService } from './score/future-event-action-score.service';
import { FutureEventSourceDiscoveryAgentService } from './source/future-event-source-discovery-agent.service';
import { FutureEventSourceService } from './source/future-event-source.service';
import { FutureEventSourceStrategyService } from './source/future-event-source-strategy.service';

@Controller('future-events')
export class FutureEventController {
  constructor(
    private readonly futureEventRepository: FutureEventRepository,
    private readonly monitoringAgentService: FutureEventMonitoringAgentService,
    private readonly sourceService: FutureEventSourceService,
    private readonly sourceStrategyService: FutureEventSourceStrategyService,
    private readonly sourceDiscoveryAgent: FutureEventSourceDiscoveryAgentService,
    private readonly candidateService: FutureEventCandidateService,
    private readonly monitoringExecutionService: FutureEventMonitoringExecutionService,
    private readonly actionScoreService: FutureEventActionScoreService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('unassigned') unassigned?: string,
    @Query('month') month?: string,
  ) {
    const parsedTake = parseTake(take);
    if (unassigned === 'true') {
      const candidates = await this.candidateService.listCandidates({
        status: 'new',
        take: parsedTake,
      });
      return candidates.map((candidate) => this.toCandidateScheduleView(candidate));
    }

    const events = await this.futureEventRepository.listEvents({
      status,
      take: parsedTake,
    });
    const eventViews = events.map((event) => this.toScheduleView(event));

    if (!month) {
      return eventViews;
    }

    const candidates = await this.candidateService.listCandidates({
      status: 'new',
      take: parsedTake,
    });
    return [...eventViews, ...candidates.map((candidate) => this.toCandidateScheduleView(candidate))]
      .filter((event) => isInMonth(event.factTime, month));
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const event = await this.futureEventRepository.createEvent({
      title: String(body.title),
      eventType: body.eventType ? String(body.eventType) : 'manual_event',
      scheduledAt: body.scheduledAt
        ? new Date(String(body.scheduledAt))
        : body.factTime
          ? new Date(String(body.factTime))
          : null,
      startAt: body.startAt ? new Date(String(body.startAt)) : null,
      endAt: body.endAt ? new Date(String(body.endAt)) : null,
      domains: Array.isArray(body.domains) ? body.domains : ['manual'],
      summary: body.summary ? String(body.summary) : null,
      whyItMatters: body.whyItMatters
        ? String(body.whyItMatters)
        : body.attentionReason
          ? String(body.attentionReason)
          : null,
      status: body.status === 'candidate' ? 'candidate' : 'confirmed',
      createdFrom: body.createdFrom ? String(body.createdFrom) : 'human',
      confidence: this.toConfidence(body.confidence),
      metadata:
        typeof body.metadata === 'object' && body.metadata !== null
          ? (body.metadata as JsonObject)
          : null,
    });
    return this.toScheduleView(event);
  }

  @Get('sources/status')
  sourceStatus() {
    return this.sourceService.sourceStatus();
  }

  @Get('source-strategy')
  sourceStrategy() {
    return this.sourceStrategyService.readStrategy();
  }

  @Post('source-strategy')
  saveSourceStrategy(@Body() body: Record<string, unknown>) {
    return this.sourceStrategyService.writeStrategy(String(body.markdown ?? ''));
  }

  @Get('source-plans')
  listSourcePlans(@Query('take') take?: string) {
    return this.futureEventRepository.listSourcePlans({
      take: parseTake(take),
    });
  }

  @Post('source-plans/generate')
  async generateSourcePlan(@Body() body: Record<string, unknown>) {
    const strategy = await this.sourceStrategyService.readStrategy();
    return this.sourceDiscoveryAgent.generatePlanFromStrategy({
      strategyMarkdown:
        typeof body.markdown === 'string' ? body.markdown : strategy.markdown,
      activate: body.activate === true,
    });
  }

  @Post('source-plans/:id/activate')
  activateSourcePlan(@Param('id') id: string) {
    return this.futureEventRepository.activateSourcePlan(id);
  }

  @Get('candidates')
  listCandidates(@Query('status') status?: string, @Query('take') take?: string) {
    return this.candidateService.listCandidates({
      status,
      take: parseTake(take),
    });
  }

  @Post('candidates/:id/confirm')
  confirmCandidate(@Param('id') id: string) {
    return this.candidateService.confirmCandidate(id);
  }

  @Post('candidates/:id/ignore')
  async ignoreCandidate(@Param('id') id: string) {
    return this.futureEventRepository.updateCandidateStatus({
      id,
      status: 'ignored',
    });
  }

  @Post('monitoring-plans/run-due')
  runDueMonitoringPlans(@Body() body: Record<string, unknown>) {
    return this.monitoringExecutionService.runDuePlans({
      observedAt: body.observedAt ? new Date(String(body.observedAt)) : undefined,
    });
  }

  @Post('monitoring-plans/:id/activate')
  activateMonitoringPlan(@Param('id') id: string) {
    return this.futureEventRepository.updateMonitoringPlanStatus({
      id,
      status: 'active',
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const event = await this.futureEventRepository.findEventById(id);
    return event ? this.toScheduleView(event) : null;
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

  private toScheduleView(event: FutureEvent) {
    const metadata = isRecord(event.metadata) ? event.metadata : {};
    const factTime = event.scheduledAt ?? event.startAt ?? null;
    const evidence = Array.isArray(metadata.evidence)
      ? metadata.evidence.map((item) => normalizeEvidence(item, event))
      : [];
    const actionScore = this.actionScoreService.scoreEvent(event);

    return {
      id: event.id,
      title: event.title,
      subject: getString(metadata.subject) ?? event.createdFrom,
      eventType: event.eventType,
      factTime: factTime?.toISOString() ?? null,
      timezone: getString(metadata.timezone) ?? 'UTC',
      schedulePrecision: getString(metadata.schedulePrecision) ?? 'unknown',
      confirmationLevel: getString(metadata.confirmationLevel) ?? 'confirmed',
      expressionBoundary: getString(metadata.expressionBoundary) ?? 'factual',
      evidence,
      windows: {
        monitoring: null,
        preheat: null,
        live: null,
        followUp: null,
      },
      actionScore,
      heat: {
        query: event.title,
        queryVersion: 'not_started',
        monitoringStartedAt: null,
        buckets: [],
        last6h: 0,
        prev6h: 0,
        growthPct: null,
        intensityMultiple: null,
        cumulative: 0,
      },
      relatedEventId: null,
      entryMode: null,
      ruleVersion: getString(metadata.ruleVersion) ?? 'future-event-v2',
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  private toCandidateScheduleView(candidate: FutureEventCandidate) {
    const factTime = candidate.scheduledAt ?? getTimeRangeDate(candidate, 'startAt');
    const evidenceRefs = normalizeStringArray(candidate.evidenceRefs);
    const summary = getString(candidate.summary) ?? candidate.title;
    const createdAt = candidate.createdAt instanceof Date ? candidate.createdAt : new Date();
    const updatedAt = candidate.updatedAt instanceof Date ? candidate.updatedAt : createdAt;
    const actionScore = this.actionScoreService.scoreCandidate(candidate);

    return {
      id: candidate.id,
      title: candidate.title,
      subject: 'future_event_candidate',
      eventType: getString(candidate.eventType) ?? 'future_event',
      factTime: factTime?.toISOString() ?? null,
      timezone: 'UTC',
      schedulePrecision: factTime ? 'unknown' : 'needs_verification',
      confirmationLevel: 'candidate',
      expressionBoundary: 'needs_review',
      evidence: evidenceRefs.map((ref) => ({
        id: ref,
        url: '',
        sourceType: 'future_event_candidate',
        verifiedAt: updatedAt.toISOString(),
        claims: [summary],
        originalId: ref,
      })),
      windows: {
        monitoring: null,
        preheat: null,
        live: null,
        followUp: null,
      },
      actionScore,
      heat: {
        query: candidate.title,
        queryVersion: 'not_started',
        monitoringStartedAt: null,
        buckets: [],
        last6h: 0,
        prev6h: 0,
        growthPct: null,
        intensityMultiple: null,
        cumulative: 0,
      },
      relatedEventId: null,
      entryMode: 'candidate',
      ruleVersion: 'future-event-candidate@v1',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeEvidence(item: unknown, event: FutureEvent) {
  const value = isRecord(item) ? item : {};
  return {
    id: getString(value.id) ?? `evidence_${event.id}`,
    url: getString(value.url) ?? '',
    sourceType: getString(value.sourceType) ?? 'manual',
    verifiedAt: getString(value.verifiedAt) ?? event.updatedAt.toISOString(),
    claims: Array.isArray(value.claims)
      ? value.claims.filter((claim): claim is string => typeof claim === 'string')
      : [],
    originalId: getString(value.originalId),
  };
}

function getTimeRangeDate(
  candidate: FutureEventCandidate,
  field: 'startAt' | 'endAt',
) {
  const timeRange = (candidate as unknown as { timeRange?: unknown }).timeRange;
  if (!isRecord(timeRange)) return null;

  const value = timeRange[field];
  if (typeof value !== 'string' || !value.trim()) return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function isInMonth(isoTime: string | null, month: string) {
  if (!isoTime || !/^\d{4}-\d{2}$/.test(month)) return false;

  const date = new Date(isoTime);
  if (!Number.isFinite(date.getTime())) return false;

  const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return value === month;
}
