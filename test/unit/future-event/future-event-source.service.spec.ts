import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { PrismaService } from '../../../src/database/prisma.service';
import { FutureEventDiscoveryAgentService } from '../../../src/future-event/discovery/future-event-discovery-agent.service';
import { FutureEventSourceService } from '../../../src/future-event/source/future-event-source.service';

describe('FutureEventSourceService', () => {
  it('collects sources from the active agent-generated source plan', async () => {
    const observedAt = new Date('2026-08-25T00:00:00.000Z');
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'run_1',
          jobId: 'future_source_plan_plan_1_official_macro',
          pluginId: 'future-events',
          capabilityId: 'future.events.discover',
          status: 'succeeded',
          startedAt: observedAt,
          finishedAt: observedAt,
          rawItemCount: 3,
          outputSummary: {
            signalCount: 3,
          },
        }),
      ),
    } as unknown as CollectionRunnerService;
    const prisma = {
      futureEventSourcePlan: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'plan_1',
            version: 1,
            status: 'active',
            sources: [
              {
                id: 'official_macro',
                pluginId: 'future-events',
                capabilityId: 'future.events.discover',
            params: {
              sources: [
                {
                  sourceType: 'bea',
                  variables: {
                    url: 'https://www.bea.gov/news/schedule',
                  },
                },
                {
                  sourceType: 'bls',
                  variables: {
                    url: 'https://www.bls.gov/schedule/news_release/bls.ics',
                  },
                },
                {
                  sourceType: 'fomc',
                  variables: {
                    url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
                  },
                },
              ],
            },
            reason: '官方宏观来源。',
              },
            ],
            refreshPolicy: {
              intervalMs: 86400000,
            },
          }),
        ),
      },
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'signal_1',
              title: 'FOMC meeting',
              observedAt,
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const discoveryAgent = {
      discoverFromSignals: jest.fn(() =>
        Promise.resolve({
          candidateCount: 1,
        }),
      ),
    } as unknown as FutureEventDiscoveryAgentService;
    const service = new FutureEventSourceService(runner, prisma, discoveryAgent);

    const result = await service.collectActiveSourcePlan(observedAt);

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'future_source_plan_plan_1_official_macro',
        pluginId: 'future-events',
        capabilityId: 'future.events.discover',
        params: expect.objectContaining({
          sources: [
            expect.objectContaining({
              sourceType: 'bea',
            }),
            expect.objectContaining({
              sourceType: 'bls',
            }),
            expect.objectContaining({
              sourceType: 'fomc',
            }),
          ],
        }),
        observedAt,
      }),
    );
    expect(discoveryAgent.discoverFromSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: expect.stringContaining('Agent 来源计划'),
        signals: [expect.objectContaining({ id: 'signal_1' })],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        planId: 'plan_1',
        sourceCount: 1,
        signalCount: 1,
        candidateCount: 1,
      }),
    );
  });
});
