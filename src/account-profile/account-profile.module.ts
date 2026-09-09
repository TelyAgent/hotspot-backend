import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { AccountMetricsService } from './account-metrics.service';
import { AccountProfileRefreshService } from './account-profile-refresh.service';
import { AccountProfileController } from './account-profile.controller';
import { AccountProfileRepository } from './account-profile.repository';
import { AccountProfileService } from './account-profile.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountProfileController],
  providers: [
    AccountProfileRepository,
    AccountProfileService,
    AccountMetricsService,
    AccountProfileRefreshService,
  ],
  exports: [
    AccountProfileService,
    AccountMetricsService,
    AccountProfileRefreshService,
    AccountProfileRepository,
  ],
})
export class AccountProfileModule {}
