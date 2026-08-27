import { FutureEventsPlugin } from '../../../src/data-source/plugins/future-events/future-events.plugin';

describe('FutureEventsPlugin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('collects configured official future event sources and normalizes them into signals', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('bls.test')) {
        return textResponse(
          [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:bls-cpi-2026-09',
            'SUMMARY:CPI for All Urban Consumers',
            'DESCRIPTION:Consumer Price Index release',
            'DTSTART:20260910T123000Z',
            'DTEND:20260910T133000Z',
            'URL:https://bls.test/cpi',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\n'),
        );
      }

      return textResponse('');
    }) as unknown as typeof fetch;

    const plugin = new FutureEventsPlugin();

    const result = await plugin.collect({
      capabilityId: 'future.events.discover',
      params: {
        sources: [
          {
            sourceType: 'bls',
            variables: {
              url: 'https://bls.test/calendar.ics',
              includeReleaseTypes: ['CPI'],
            },
          },
        ],
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'future.events.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(result.rawItems).toHaveLength(1);
    expect(result.rawItems[0]).toEqual(
      expect.objectContaining({
        source: 'future-events',
        sourceType: 'future_event_source_item',
        sourceItemId: 'bls:bls-cpi-2026-09',
      }),
    );

    const normalized = await plugin.normalize({
      rawItem: {
        id: 'raw_1',
        ...result.rawItems[0],
        observedAtBucket: new Date('2026-08-25T00:00:00.000Z'),
        dedupeKey:
          'future-events:future_event_source_item:bls:bls-cpi-2026-09:2026-08-25T00:00:00.000Z',
        createdAt: new Date('2026-08-25T00:00:00.000Z'),
        updatedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'future.events.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(normalized?.signal).toEqual(
      expect.objectContaining({
        signalType: 'future_event',
        title: 'CPI for All Urban Consumers',
        platform: 'official_schedule',
        metadata: expect.objectContaining({
          sourceType: 'bls',
          sourceItemId: 'bls-cpi-2026-09',
          scheduledAt: '2026-09-10T12:30:00.000Z',
          jobId: 'job_1',
        }),
      }),
    );
    expect(normalized?.evidence?.[0]).toEqual(
      expect.objectContaining({
        sourceType: 'future_event_source_item',
        sourceItemId: 'bls:bls-cpi-2026-09',
        url: 'https://bls.test/cpi',
      }),
    );
  });

  it('times out one slow official source and continues collecting other sources', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('slow.test')) {
        return new Promise<Response>(() => undefined);
      }

      return textResponse(
        [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:bls-cpi-2026-09',
          'SUMMARY:CPI for All Urban Consumers',
          'DESCRIPTION:Consumer Price Index release',
          'DTSTART:20260910T123000Z',
          'DTEND:20260910T133000Z',
          'URL:https://bls.test/cpi',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\n'),
      );
    }) as unknown as typeof fetch;

    const plugin = new FutureEventsPlugin();

    const result = await plugin.collect({
      capabilityId: 'future.events.discover',
      params: {
        fetchTimeoutMs: 1,
        sources: [
          {
            sourceType: 'opm',
            variables: {
              url: 'https://slow.test/opm',
            },
          },
          {
            sourceType: 'bls',
            variables: {
              url: 'https://bls.test/calendar.ics',
              includeReleaseTypes: ['CPI'],
            },
          },
        ],
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'future.events.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(result.rawItems).toHaveLength(1);
    expect(result.rawItems[0].sourceItemId).toBe('bls:bls-cpi-2026-09');
    expect(result.summary?.errors).toEqual([
      expect.objectContaining({
        sourceType: 'opm',
        message: expect.stringContaining('timed out'),
      }),
    ]);
  });

  it('collects future FOMC meetings before statements are published', async () => {
    global.fetch = jest.fn(() =>
      textResponse(
        [
          '<html><body>',
          '<nav>2026 | 2025 | 2024 Future Year: 2027</nav>',
          '<h4>2026 FOMC Meetings</h4>',
          '<p>January 27-28 Statement: PDF | HTML</p>',
          '<p>September 15-16*</p>',
          '<p>October 27-28</p>',
          '<p>December 8-9*</p>',
          '<p>* Meeting associated with a Summary of Economic Projections.</p>',
          '<h4>2025 FOMC Meetings</h4>',
          '</body></html>',
        ].join('\n'),
      ),
    ) as unknown as typeof fetch;

    const plugin = new FutureEventsPlugin();

    const result = await plugin.collect({
      capabilityId: 'future.events.discover',
      params: {
        sources: [
          {
            sourceType: 'fomc',
            variables: {
              url: 'https://federalreserve.test/fomc',
            },
          },
        ],
      },
      context: {
        jobId: 'future_source_plan_plan_1_official_macro',
        capabilityId: 'future.events.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(result.rawItems.map((item) => getPayloadTitle(item.payload))).toEqual([
      'FOMC meeting September 15-16, 2026',
      'FOMC meeting October 27-28, 2026',
      'FOMC meeting December 8-9, 2026',
    ]);
  });

  it('collects only the current OPM holiday schedule section', async () => {
    global.fetch = jest.fn(() =>
      textResponse(
        [
          '<html><body>',
          '<h2>2024 Holiday Schedule</h2>',
          '<table>',
          '<tr><td>Monday, October 14</td><td>Columbus Day</td></tr>',
          '<tr><td>Thursday, November 28</td><td>Thanksgiving Day</td></tr>',
          '</table>',
          '<h2>2025 Holiday Schedule</h2>',
          '<table>',
          '<tr><td>Monday, October 13</td><td>Columbus Day</td></tr>',
          '<tr><td>Thursday, November 27</td><td>Thanksgiving Day</td></tr>',
          '</table>',
          '<h2>2026 Holiday Schedule</h2>',
          '<table>',
          '<tr><td>Monday, September 7</td><td>Labor Day</td></tr>',
          '<tr><td>Monday, October 12</td><td>Columbus Day</td></tr>',
          '<tr><td>Thursday, November 26</td><td>Thanksgiving Day</td></tr>',
          '</table>',
          '</body></html>',
        ].join('\n'),
      ),
    ) as unknown as typeof fetch;

    const plugin = new FutureEventsPlugin();

    const result = await plugin.collect({
      capabilityId: 'future.events.discover',
      params: {
        sources: [
          {
            sourceType: 'opm',
            variables: {
              url: 'https://opm.test/holidays',
            },
          },
        ],
      },
      context: {
        jobId: 'future_source_plan_plan_1_official_macro',
        capabilityId: 'future.events.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(result.rawItems.map((item) => getPayloadTitle(item.payload))).toEqual([
      'Labor Day',
      'Columbus Day',
      'Thanksgiving Day',
    ]);
    expect(result.rawItems.map((item) => getPayloadStartTime(item.payload))).toEqual([
      '2026-09-07T00:00:00.000Z',
      '2026-10-12T00:00:00.000Z',
      '2026-11-26T00:00:00.000Z',
    ]);
  });
});

function textResponse(text: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  } as Response);
}

function getPayloadTitle(payload: unknown) {
  return payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'title' in payload
    ? payload.title
    : undefined;
}

function getPayloadStartTime(payload: unknown) {
  return payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'startTime' in payload
    ? payload.startTime
    : undefined;
}
