import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

interface DuplicateEventRow {
  id: string;
  title: string;
  evidenceRefs: unknown;
  createdAt: Date;
}

async function main() {
  const groups = await prisma.$queryRaw<Array<{ evidence_refs: string; cnt: number }>>`
    SELECT "evidenceRefs"::text AS evidence_refs, COUNT(*)::int AS cnt
    FROM "events"
    WHERE "canonicalEventId" IS NULL
      AND "status" <> 'archived'
    GROUP BY "evidenceRefs"::text
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `;

  if (groups.length === 0) {
    console.log('没有发现相同 evidenceRefs 的重复 Event。');
    return;
  }

  let archivedCount = 0;
  for (const group of groups) {
    const events = await prisma.$queryRaw<DuplicateEventRow[]>`
      SELECT id, title, "evidenceRefs", "createdAt"
      FROM "events"
      WHERE "canonicalEventId" IS NULL
        AND "status" <> 'archived'
        AND "evidenceRefs"::text = ${group.evidence_refs}
      ORDER BY "createdAt" ASC
    `;

    const [canonical, ...duplicates] = events;
    if (!canonical || duplicates.length === 0) {
      continue;
    }

    archivedCount += duplicates.length;
    console.log(
      `${apply ? '归档' : '预览'}：保留 ${canonical.id}「${canonical.title}」，重复 ${duplicates.length} 条`,
    );
    for (const duplicate of duplicates) {
      console.log(`  - ${duplicate.id}「${duplicate.title}」`);
    }

    if (!apply) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.eventSourceContext.updateMany({
        where: {
          mainEventId: {
            in: duplicates.map((event) => event.id),
          },
        },
        data: {
          mainEventId: canonical.id,
        },
      });

      await tx.event.updateMany({
        where: {
          id: {
            in: duplicates.map((event) => event.id),
          },
        },
        data: {
          canonicalEventId: canonical.id,
          status: 'archived',
        },
      });

      await tx.event.update({
        where: { id: canonical.id },
        data: {
          contextVersion: {
            increment: duplicates.length,
          },
        },
      });
    });
  }

  console.log(
    apply
      ? `完成：已归档 ${archivedCount} 条重复 Event。`
      : `预览完成：将归档 ${archivedCount} 条重复 Event。确认后可执行 npm run events:archive-duplicates -- --apply`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
