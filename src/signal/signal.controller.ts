import { Controller, Get, Param, Query } from '@nestjs/common';
import { parseTake } from '../common/utils/request.util';
import { SignalEvidenceEnrichmentService } from './enrichment/signal-evidence-enrichment.service';
import { EvidenceRepository } from './evidence/evidence.repository';
import { SignalRepository } from './signal/signal.repository';
import { ProjectConfigService } from '../project-config/project-config.service';
import { JsonValue } from '../common/types/json.type';

@Controller('signals')
export class SignalController {
  constructor(
    private readonly signalRepository: SignalRepository,
    private readonly evidenceRepository: EvidenceRepository,
    private readonly enrichmentService: SignalEvidenceEnrichmentService,
    private readonly projectConfigService: ProjectConfigService,
  ) {}

  @Get()
  list(@Query('take') take?: string, @Query('signalType') signalType?: string) {
    return this.signalRepository.findMany({
      take: parseTake(take),
      signalType,
    });
  }

  @Get('evidence')
  listEvidenceByIds(@Query('ids') ids?: string) {
    return this.evidenceRepository.findByIds(parseIds(ids));
  }

  @Get('kol-radar')
  async getKolRadarFeed(
    @Query('windowHours') windowHours?: string,
    @Query('take') take?: string,
  ) {
    const config = await this.projectConfigService.getXTrendCollectionConfig();
    const enabledHandles = new Set(
      config.kolRadarAccounts
        .filter((account) => account.enabled)
        .map((account) => normalizeHandle(account.handle)),
    );
    const windowMs = normalizePositiveNumber(windowHours, 6) * 60 * 60 * 1000;
    const since = new Date(Date.now() - windowMs);
    const signals = await this.signalRepository.findManyForMcp({
      take: parseTake(take ?? '500'),
      signalType: 'x_post',
      platform: 'x',
      since,
    });

    const grouped = new Map<string, KolRadarFeedItem>();
    for (const signal of signals) {
      const metadata = isRecord(signal.metadata) ? signal.metadata : {};
      const handle = normalizeHandle(getString(metadata.authorHandle) ?? getHandleFromTitle(signal.title));
      if (!handle || (enabledHandles.size > 0 && !enabledHandles.has(handle))) {
        continue;
      }

      const item: KolRadarFeedItem = {
        id: signal.id,
        handle,
        authorName: getString(metadata.authorName),
        title: signal.title,
        summary: signal.summary?.trim() || signal.title,
        observedAt: signal.observedAt.toISOString(),
        publishedAt: getString(metadata.publishedAt),
        postType: getString(metadata.postType),
        url: getString(metadata.url),
        metrics: normalizeMetrics(signal.metrics),
      };

      const existing = grouped.get(handle);
      if (!existing || compareKolFeedItem(item, existing) < 0) {
        grouped.set(handle, item);
      }
    }

    const items = Array.from(grouped.values()).sort(compareKolFeedItem);
    return {
      collectedAt: signals[0]?.observedAt?.toISOString() ?? new Date().toISOString(),
      windowHours: normalizePositiveNumber(windowHours, 6),
      items,
    };
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.signalRepository.findById(id);
  }

  @Get(':id/evidence')
  listEvidence(@Param('id') id: string, @Query('take') take?: string) {
    return this.evidenceRepository.findMany({
      signalId: id,
      take: parseTake(take),
    });
  }

  @Get(':id/enrichment')
  getEnrichment(@Param('id') id: string, @Query('maxEvidence') maxEvidence?: string) {
    return this.enrichmentService.enrich({
      signalId: id,
      mode: 'manual_refresh',
      maxEvidence: parseTake(maxEvidence),
    });
  }
}

function parseIds(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}

interface KolRadarFeedItem {
  id: string;
  handle: string;
  authorName: string | null;
  title: string;
  summary: string;
  observedAt: string;
  publishedAt: string | null;
  postType: string | null;
  url: string | null;
  metrics: Record<string, number>;
}

function getHandleFromTitle(title: string) {
  const [handle = 'unknown'] = title.split(/[：:]/);
  return handle;
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function normalizePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function getString(value: JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMetrics(value: JsonValue | null | undefined): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[key] = raw;
      continue;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        result[key] = parsed;
      }
    }
  }
  return result;
}

function compareKolFeedItem(a: KolRadarFeedItem, b: KolRadarFeedItem) {
  const viewsDiff = getMetricNumber(b.metrics, 'views', 'viewCount') - getMetricNumber(a.metrics, 'views', 'viewCount');
  if (viewsDiff !== 0) return viewsDiff;
  const aTime = new Date(a.observedAt).getTime();
  const bTime = new Date(b.observedAt).getTime();
  if (aTime !== bTime) return bTime - aTime;
  const likesDiff = getMetricNumber(b.metrics, 'likes', 'likeCount') - getMetricNumber(a.metrics, 'likes', 'likeCount');
  if (likesDiff !== 0) return likesDiff;
  return getMetricNumber(b.metrics, 'replies', 'replyCount', 'commentCount', 'comments') - getMetricNumber(a.metrics, 'replies', 'replyCount', 'commentCount', 'comments');
}

function getMetricNumber(metrics: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}
