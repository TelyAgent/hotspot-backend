import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { DataSourcePluginRegistry } from '../../../src/data-source/registry/data-source-plugin.registry';
import { FutureEventRepository } from '../../../src/future-event/future-event.repository';
import { FutureEventSourceDiscoveryAgentService } from '../../../src/future-event/source/future-event-source-discovery-agent.service';

describe('FutureEventSourceDiscoveryAgentService', () => {
  it('generates a source collection plan from markdown strategy and registered plugins', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_source_plan_1',
          status: 'succeeded',
          result: {
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
                reason: '宏观事件需要官方经济日历和议息会议日历。',
              },
            ],
            missingSources: [
              {
                name: '预测市场事件日历',
                reason: '当前没有注册对应采集插件。',
              },
            ],
            refreshPolicy: {
              intervalMs: 86400000,
            },
            reason: '根据运营策略生成官方来源采集计划。',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const registry = {
      list: jest.fn(() => [
        {
          id: 'future-events',
          name: '未来事件来源采集',
          platform: 'official_schedule',
          capabilities: [
            {
              id: 'future.events.discover',
              name: '采集官方未来事件来源',
            },
          ],
        },
      ]),
    } as unknown as DataSourcePluginRegistry;
    const repository = {
      findLatestSourcePlan: jest.fn(() => Promise.resolve({ version: 2 })),
      createSourcePlan: jest.fn((input) =>
        Promise.resolve({
          id: 'source_plan_3',
          ...input,
        }),
      ),
      activateSourcePlan: jest.fn((id) =>
        Promise.resolve({
          id,
          status: 'active',
        }),
      ),
    } as unknown as FutureEventRepository;
    const service = new FutureEventSourceDiscoveryAgentService(
      workflowEngine,
      registry,
      repository,
    );

    const result = await service.generatePlanFromStrategy({
      strategyMarkdown: '# 未来事件来源策略\n关注宏观经济。',
      activate: true,
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'future_event_source_discovery',
        goal: expect.objectContaining({
          strategyMarkdown: expect.stringContaining('关注宏观经济'),
          availablePlugins: [
            expect.objectContaining({
              pluginId: 'future-events',
              capabilities: [
                expect.objectContaining({
                  capabilityId: 'future.events.discover',
                }),
              ],
            }),
          ],
          nextVersion: 3,
        }),
      }),
    );
    expect(repository.createSourcePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        strategyMarkdown: expect.stringContaining('关注宏观经济'),
        generatedBy: 'agent',
        agentRunId: 'run_source_plan_1',
        status: 'draft',
        sources: [
          expect.objectContaining({
            pluginId: 'future-events',
            capabilityId: 'future.events.discover',
          }),
        ],
      }),
    );
    expect(repository.activateSourcePlan).toHaveBeenCalledWith('source_plan_3');
    expect(result.status).toBe('active');
  });
});
