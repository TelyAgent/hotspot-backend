import { PrismaService } from '../../../src/database/prisma.service';
import { XTrendSnapshotService } from '../../../src/data-source/plugins/x-trends/x-trend-snapshot.service';

describe('XTrendSnapshotService', () => {
  it('creates regional snapshots and diffs against the previous snapshot', async () => {
    const prisma = {
      xTrendSnapshot: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'snapshot_previous',
            items: [
              {
                query: 'OpenAI',
                name: 'OpenAI',
                rank: 15,
              },
              {
                query: 'Claude',
                name: 'Claude',
                rank: 3,
              },
            ],
          }),
        ),
        create: jest.fn(() =>
          Promise.resolve({
            id: 'snapshot_current',
          }),
        ),
      },
      xTrendSnapshotDiff: {
        createMany: jest.fn(() => Promise.resolve({ count: 2 })),
      },
    } as unknown as PrismaService;
    const service = new XTrendSnapshotService(prisma);

    await service.createSnapshotsForCollection({
      collectionRunId: 'run_1',
      observedAt: new Date('2026-08-25T08:00:00.000Z'),
      rawItems: [
        {
          source: 'x',
          sourceType: 'x_trend',
          sourceItemId: 'United States:5:OpenAI',
          observedAt: new Date('2026-08-25T08:00:00.000Z'),
          payload: {
            name: 'OpenAI',
            query: 'OpenAI',
            region: 'United States',
            rank: 5,
          },
          metadata: {
            region: 'United States',
            rank: 5,
          },
        },
        {
          source: 'x',
          sourceType: 'x_trend',
          sourceItemId: 'United States:8:Grok',
          observedAt: new Date('2026-08-25T08:00:00.000Z'),
          payload: {
            name: 'Grok',
            query: 'Grok',
            region: 'United States',
            rank: 8,
          },
          metadata: {
            region: 'United States',
            rank: 8,
          },
        },
      ],
    });

    expect(prisma.xTrendSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          collectionRunId: 'run_1',
          region: 'United States',
          itemCount: 2,
          items: {
            create: [
              expect.objectContaining({
                name: 'OpenAI',
                query: 'OpenAI',
                rank: 5,
              }),
              expect.objectContaining({
                name: 'Grok',
                query: 'Grok',
                rank: 8,
              }),
            ],
          },
        }),
      }),
    );
    expect(prisma.xTrendSnapshotDiff.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          snapshotId: 'snapshot_current',
          previousSnapshotId: 'snapshot_previous',
          query: 'OpenAI',
          previousRank: 15,
          currentRank: 5,
          rankDelta: 10,
          diffType: 'up',
        }),
        expect.objectContaining({
          snapshotId: 'snapshot_current',
          previousSnapshotId: 'snapshot_previous',
          query: 'Grok',
          previousRank: null,
          currentRank: 8,
          rankDelta: null,
          diffType: 'new',
        }),
        expect.objectContaining({
          snapshotId: 'snapshot_current',
          previousSnapshotId: 'snapshot_previous',
          query: 'Claude',
          previousRank: 3,
          currentRank: null,
          rankDelta: null,
          diffType: 'dropped',
        }),
      ]),
    });
  });
});
