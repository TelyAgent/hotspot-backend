import { Injectable } from '@nestjs/common';
import { CollectionRun } from '../../data-source/runner/collection-job.types';
import { CollectionRunRepository } from '../../data-source/runner/collection-run.repository';

const TOPIC_WATCH_JOB_PREFIX = 'topic_watch_';

@Injectable()
export class TopicWatchPipelineStatusService {
  constructor(private readonly collectionRunRepository: CollectionRunRepository) {}

  async getStatus() {
    const runs = await this.collectionRunRepository.findByJobIdPrefix({
      jobIdPrefix: TOPIC_WATCH_JOB_PREFIX,
      take: 200,
    });
    const latestRun = runs[0] ?? null;
    const latestFetchRun = latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          startedAt: latestRun.startedAt.toISOString(),
          finishedAt: latestRun.finishedAt?.toISOString() ?? null,
          accountCount: countAccountsInLatestBatch(runs, latestRun.startedAt),
          itemCount: latestRun.rawItemCount,
          error: latestRun.errorMessage ?? null,
        }
      : null;

    return {
      latestFetchRun,
      failedAccounts: runs
        .filter((run) => run.status === 'failed')
        .slice(0, 20)
        .map((run) => ({
          handle: parseHandleFromTopicWatchJobId(run.jobId),
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          since: '',
          until: '',
          itemCount: run.rawItemCount,
          error: run.errorMessage ?? null,
        })),
      recentPostCount24h: sumRawItemsInWindow(runs, 24 * 60 * 60 * 1000),
      candidateCount24h: 0,
      triggeredCandidateCount24h: 0,
      latestWorkflowRun: null,
    };
  }
}

function countAccountsInLatestBatch(runs: CollectionRun[], latestStartedAt: Date) {
  const batchWindowMs = 10 * 60 * 1000;
  const latest = latestStartedAt.getTime();

  return runs.filter((run) => latest - run.startedAt.getTime() <= batchWindowMs)
    .length;
}

function sumRawItemsInWindow(runs: CollectionRun[], windowMs: number) {
  const latestStartedAt = runs[0]?.startedAt.getTime();
  if (!latestStartedAt) return 0;
  const windowStartAt = latestStartedAt - windowMs;

  return runs
    .filter((run) => run.startedAt.getTime() >= windowStartAt)
    .reduce((sum, run) => sum + run.rawItemCount, 0);
}

function parseHandleFromTopicWatchJobId(jobId: string) {
  const match = /^topic_watch_.+_x_([^_]+)_/.exec(jobId);
  return match?.[1] ?? 'unknown';
}
