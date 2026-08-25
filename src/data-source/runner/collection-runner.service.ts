import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpportunityMiningSchedulerService } from '../../opportunity/mining/opportunity-mining-scheduler.service';
import { XTrendSnapshotService } from '../plugins/x-trends/x-trend-snapshot.service';
import { EvidenceService } from '../../signal/evidence/evidence.service';
import { RawItemService } from '../../signal/raw-item/raw-item.service';
import { SignalService } from '../../signal/signal/signal.service';
import { DataSourcePluginRegistry } from '../registry/data-source-plugin.registry';
import {
  CollectionJobConfig,
  CollectionRun,
} from './collection-job.types';
import { CollectionRunRepository } from './collection-run.repository';

@Injectable()
export class CollectionRunnerService {
  constructor(
    private readonly pluginRegistry: DataSourcePluginRegistry,
    private readonly collectionRunRepository: CollectionRunRepository,
    private readonly rawItemService: RawItemService,
    private readonly signalService: SignalService,
    private readonly evidenceService: EvidenceService,
    @Optional()
    private readonly xTrendSnapshotService?: XTrendSnapshotService,
    @Optional()
    private readonly opportunityMiningScheduler?: OpportunityMiningSchedulerService,
  ) {}

  async run(jobConfig: CollectionJobConfig): Promise<CollectionRun> {
    const startedAt = new Date();
    const observedAt = jobConfig.observedAt ?? startedAt;
    const run = await this.collectionRunRepository.createStarted({
      jobConfig,
      startedAt,
    });

    try {
      const plugin = this.pluginRegistry.get(jobConfig.pluginId);
      const result = await plugin.collect({
        capabilityId: jobConfig.capabilityId,
        params: jobConfig.params,
        context: {
          jobId: jobConfig.id,
          capabilityId: jobConfig.capabilityId,
          observedAt,
        },
      });

      let signalCount = 0;
      let evidenceCount = 0;

      const context = {
        jobId: jobConfig.id,
        capabilityId: jobConfig.capabilityId,
        observedAt,
      };

      for (const rawItem of result.rawItems) {
        const savedRawItem = await this.rawItemService.create(rawItem);

        if (!plugin.normalize) {
          continue;
        }

        const normalized = await plugin.normalize({
          rawItem: savedRawItem,
          context,
        });

        if (!normalized?.signal) {
          continue;
        }

        const signal = await this.signalService.createFromRawItem({
          rawItem: savedRawItem,
          ...normalized.signal,
        });
        signalCount += 1;

        for (const evidence of normalized.evidence ?? []) {
          await this.evidenceService.createFromSignal({
            signal,
            ...evidence,
          });
          evidenceCount += 1;
        }
      }

      if (jobConfig.pluginId === 'x-trends') {
        await this.xTrendSnapshotService?.createSnapshotsForCollection({
          collectionRunId: run.id,
          observedAt,
          rawItems: result.rawItems,
        });
      }

      const opportunityMining =
        signalCount > 0
          ? await this.opportunityMiningScheduler?.runDueMining(observedAt)
          : undefined;

      return this.collectionRunRepository.markSucceeded({
        runId: run.id,
        finishedAt: new Date(),
        rawItemCount: result.rawItems.length,
        outputSummary: {
          ...(result.summary ?? {}),
          rawItemCount: result.rawItems.length,
          signalCount,
          evidenceCount,
          ...(opportunityMining ? { opportunityMining } : {}),
        } as Prisma.InputJsonValue,
      });
    } catch (error) {
      return this.collectionRunRepository.markFailed({
        runId: run.id,
        finishedAt: new Date(),
        errorMessage:
          error instanceof Error ? error.message : 'Unknown collection error',
      });
    }
  }
}
