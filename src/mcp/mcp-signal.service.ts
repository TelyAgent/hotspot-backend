import { Injectable } from '@nestjs/common';
import { JsonObject, JsonValue } from '../common/types/json.type';
import { SignalRepository } from '../signal/signal/signal.repository';
import { Signal } from '../signal/signal/signal.types';
import {
  clampMcpLimit,
  McpSearchSignalsInput,
  McpSignalListItem,
  parseOptionalDate,
} from './mcp.types';

@Injectable()
export class McpSignalService {
  constructor(private readonly repository: SignalRepository) {}

  async searchSignals(input: McpSearchSignalsInput = {}): Promise<McpSignalListItem[]> {
    const signals = await this.repository.findManyForMcp({
      query: input.query,
      signalType: input.signalType,
      platform: input.platform,
      since: parseOptionalDate(input.since),
      take: clampMcpLimit(input.limit),
    });

    return signals.map((signal) => this.toSignalItem(signal));
  }

  private toSignalItem(signal: Signal): McpSignalListItem {
    const metadata = asObject(signal.metadata);
    const rawRefs = asObject(signal.rawRefs);
    return {
      signalId: signal.id,
      signalType: signal.signalType,
      platform: signal.platform ?? signal.source,
      sourceName:
        readString(metadata.authorHandle) ??
        readString(metadata.authorName) ??
        readString(metadata.sourceName) ??
        readString(metadata.channelTitle) ??
        signal.source,
      title: signal.title,
      summary: signal.summary ?? null,
      url:
        readString(rawRefs.url) ??
        readString(metadata.url) ??
        readString(metadata.postUrl) ??
        readString(metadata.videoUrl) ??
        readString(metadata.sourceUrl) ??
        null,
      publishedAt:
        toIso(readString(metadata.publishedAt) ?? readString(rawRefs.publishedAt)) ??
        toIso(readString(metadata.createdAt)) ??
        null,
      observedAt: signal.observedAt.toISOString(),
      metrics: signal.metrics ?? null,
      linkedEventIds: readStringArray(metadata.linkedEventIds) ?? readStringArray(metadata.eventIds) ?? [],
    };
  }
}

function asObject(value: JsonValue | null | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
}

function toIso(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
