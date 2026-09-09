/**
 * 一次性脚本：跑通 KOL 雷达账号池的冷启动。
 *
 * 步骤：
 *  1. 触发一次 signals → account_profiles 互动指标聚合（自动发现新 handle）
 *  2. 触发一次静态资料刷新（拉 followers/region/bio/twitterUserId）
 *
 * 用法：`npx ts-node scripts/init-account-pool.ts`
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AccountMetricsService } from '../src/account-profile/account-metrics.service';
import { AccountProfileRefreshService } from '../src/account-profile/account-profile-refresh.service';
import { PrismaService } from '../src/database/prisma.service';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/hotspot_agent';
// 一次性脚本默认打开数据源定时调度
process.env.DATA_SOURCE_SCHEDULER_ENABLED ??= 'false';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const metrics = app.get(AccountMetricsService);
    const refresh = app.get(AccountProfileRefreshService);

    const before = await prisma.accountProfile.count();
    console.log(`[init-account-pool] account_profiles rows before: ${before}`);

    const engagement = await metrics.refreshEngagement();
    console.log(
      `[init-account-pool] engagement refreshed: scanned=${engagement.scannedSignals}, matched=${engagement.matchedSignals}, updated=${engagement.updated}, created=${engagement.created}, resetStale=${engagement.resetStale}, skippedTombstoned=${engagement.skippedTombstoned}`,
    );

    const profile = await refresh.refreshActiveAccounts();
    console.log(
      `[init-account-pool] profile refresh: scanned=${profile.scanned}, refreshed=${profile.refreshed}, failed=${profile.failed}, skippedMissingKey=${profile.skippedMissingKey}`,
    );

    const after = await prisma.accountProfile.count();
    console.log(`[init-account-pool] account_profiles rows after: ${after}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[init-account-pool] failed:', error);
  process.exit(1);
});
