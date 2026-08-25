import { Injectable } from '@nestjs/common';
import {
  DataSourceCollectInput,
  DataSourceCollectResult,
  DataSourcePlugin,
} from '../data-source-plugin.interface';

@Injectable()
export class MockDataSourcePlugin implements DataSourcePlugin {
  readonly id = 'mock';
  readonly name = 'Mock Data Source';
  readonly platform = 'mock';
  readonly capabilities = [
    {
      id: 'list-items',
      name: 'List Items',
      description: 'Returns deterministic mock raw items for tests.',
    },
  ];

  async collect(
    input: DataSourceCollectInput,
  ): Promise<DataSourceCollectResult> {
    return {
      rawItems: [
        {
          source: this.platform,
          sourceType: input.capabilityId,
          sourceItemId: 'mock_item_1',
          observedAt: input.context.observedAt,
          payload: {
            title: 'Mock item',
          },
          metadata: {
            jobId: input.context.jobId,
          },
        },
      ],
      summary: {
        count: 1,
      },
    };
  }
}
