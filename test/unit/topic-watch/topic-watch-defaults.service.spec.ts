import { PrismaService } from '../../../src/database/prisma.service';
import { TopicWatchDefaultsService } from '../../../src/topic-watch/defaults/topic-watch-defaults.service';

describe('TopicWatchDefaultsService', () => {
  it('seeds previous topic circle configs as topic watches and active monitoring plans', async () => {
    const prisma = {
      topicWatch: {
        upsert: jest.fn((input) =>
          Promise.resolve({
            id: input.where.id,
            ...input.create,
          }),
        ),
      },
      topicMonitoringPlan: {
        upsert: jest.fn((input) =>
          Promise.resolve({
            id: input.where.topicWatchId_version.topicWatchId,
            ...input.create,
          }),
        ),
      },
      topicWatchAccount: {
        updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
        upsert: jest.fn((input) =>
          Promise.resolve({
            id: input.where.topicWatchId_handle.handle,
            ...input.create,
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = new TopicWatchDefaultsService(prisma);

    await service.seedDefaults();

    expect(prisma.topicWatch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'topic-ai-tech',
        },
        create: expect.objectContaining({
          name: 'AI 与科技',
          status: 'active',
        }),
      }),
    );
    expect(prisma.topicMonitoringPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          topicWatchId_version: {
            topicWatchId: 'topic-ai-tech',
            version: 1,
          },
        },
        create: expect.objectContaining({
          status: 'active',
          sources: expect.arrayContaining([
            expect.objectContaining({
              platform: 'x',
              sourceType: 'account',
              handle: 'OpenAI',
            }),
          ]),
        }),
      }),
    );
  });
});
