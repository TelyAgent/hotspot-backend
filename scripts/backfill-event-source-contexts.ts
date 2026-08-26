import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'asc' },
  });
  const existingContexts = await prisma.eventSourceContext.findMany({
    select: { mainEventId: true },
  });
  const existingEventIds = new Set(
    existingContexts
      .map((item) => item.mainEventId)
      .filter((value): value is string => typeof value === 'string'),
  );
  const candidates = events.filter((event) => !existingEventIds.has(event.id));
  const sourceStats = new Map<string, number>();

  for (const event of candidates) {
    const sourceType = inferSourceType(event.labels, event.evidenceRefs);
    sourceStats.set(sourceType, (sourceStats.get(sourceType) ?? 0) + 1);

    if (!apply) continue;

    await prisma.eventSourceContext.create({
      data: {
        mainEventId: event.id,
        sourceType,
        triggerType: inferTriggerType(event.labels),
        triggerRuleCode: inferTriggerRuleCode(event.labels),
        ruleVersion: inferRuleVersion(event.labels),
        contextVersion: event.contextVersion,
        title: event.title,
        summary: event.summary,
        identity: event.identity ?? fallbackIdentity(event),
        evidenceRefs: normalizeStringArray(event.evidenceRefs),
        signalRefs: [],
        payload: {
          backfilled: true,
          eventId: event.id,
          labels: event.labels ?? [],
        },
        triggeredAt: event.occurredAt ?? event.createdAt,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        totalEvents: events.length,
        existingContextEvents: existingEventIds.size,
        backfillCandidates: candidates.length,
        sourceStats: Object.fromEntries(sourceStats.entries()),
      },
      null,
      2,
    ),
  );
}

function inferSourceType(labels: unknown, evidenceRefs: unknown): string {
  const sourceLabel = normalizeLabels(labels).find((label) => label.category === 'source');
  if (sourceLabel?.sourcePath) return sourceLabel.sourcePath;
  if (sourceLabel?.code) return sourceLabel.code;
  return normalizeStringArray(evidenceRefs).length ? 'unknown' : 'unknown';
}

function inferTriggerType(labels: unknown): string {
  const trigger = normalizeLabels(labels).find(
    (label) => label.category === 'trigger' || label.category === 'aggregation',
  );
  return trigger?.code ?? 'backfilled';
}

function inferTriggerRuleCode(labels: unknown): string | null {
  const trigger = normalizeLabels(labels).find(
    (label) => label.category === 'trigger' || label.category === 'aggregation',
  );
  return trigger?.code ?? null;
}

function inferRuleVersion(labels: unknown): string | null {
  const label = normalizeLabels(labels).find((item) => item.sourcePath);
  return label?.sourcePath ?? null;
}

function fallbackIdentity(event: {
  title: string;
  summary: string;
  occurredAt: Date | null;
  createdAt: Date;
}) {
  const factTime = event.occurredAt ?? event.createdAt;
  return {
    subject: event.title.split(/[：:·|-]/)[0]?.trim() || event.title,
    action: 'unknown',
    object: event.title,
    time: {
      exactAt: factTime.toISOString(),
      timezone: 'Asia/Shanghai',
    },
    state: 'unknown',
    coreFact: event.summary || event.title,
  };
}

function normalizeLabels(value: unknown): Array<{
  code: string;
  category: string;
  sourcePath?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.code !== 'string') return [];
    return [
      {
        code: item.code,
        category: typeof item.category === 'string' ? item.category : 'trigger',
        sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : undefined,
      },
    ];
  });
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
