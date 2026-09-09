import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccountMetricsService } from './account-metrics.service';
import { AccountProfileRefreshService } from './account-profile-refresh.service';
import { AccountProfileService } from './account-profile.service';
import {
  ACCOUNT_PROFILE_SOURCES,
  AccountProfileDto,
  AccountProfileRefreshResult,
  AccountProfileSource,
  EngagementRefreshResult,
  ListAccountProfilesOptions,
} from './account-profile.types';

@Controller('account-profiles')
export class AccountProfileController {
  constructor(
    private readonly accountProfileService: AccountProfileService,
    private readonly accountMetricsService: AccountMetricsService,
    private readonly accountProfileRefreshService: AccountProfileRefreshService,
  ) {}

  @Get()
  list(
    @Query('monitored') monitored?: string,
    @Query('monitoring') monitoring?: string,
    @Query('active') active?: string,
    @Query('source') source?: string,
    @Query('q') query?: string,
  ): Promise<AccountProfileDto[]> {
    const options: ListAccountProfilesOptions = {};

    if (monitored === 'true' || monitored === 'false') {
      options.monitored = monitored === 'true';
    }

    if (active === 'true' || active === 'false') {
      options.active = active === 'true';
    }

    if (monitoring === 'true' || monitoring === 'false') {
      options.monitoring = monitoring === 'true';
    }

    if (source && (ACCOUNT_PROFILE_SOURCES as readonly string[]).includes(source)) {
      options.source = source as AccountProfileSource;
    }

    if (typeof query === 'string' && query.trim()) {
      options.query = query.trim();
    }

    return this.accountProfileService.list(options);
  }

  @Get('monitored-handles')
  listMonitoredHandles(): Promise<string[]> {
    return this.accountProfileService.listMonitoredHandles();
  }

  @Post('metrics/refresh')
  refreshMetrics(
    @Body() body?: { windowDays?: number },
  ): Promise<EngagementRefreshResult> {
    const windowDays = typeof body?.windowDays === 'number' ? body.windowDays : undefined;
    return this.accountMetricsService.refreshEngagement({ windowDays });
  }

  @Post('refresh')
  refreshProfiles(
    @Body() body?: { intervalMs?: number; batchSize?: number; maxAccounts?: number },
  ): Promise<AccountProfileRefreshResult> {
    return this.accountProfileRefreshService.refreshActiveAccounts({
      intervalMs: typeof body?.intervalMs === 'number' ? body.intervalMs : undefined,
      batchSize: typeof body?.batchSize === 'number' ? body.batchSize : undefined,
      maxAccounts: typeof body?.maxAccounts === 'number' ? body.maxAccounts : undefined,
    });
  }

  @Post()
  create(
    @Body()
    body: {
      handle?: string;
      groupTag?: string | null;
      monitorEnabled?: boolean;
    },
  ): Promise<AccountProfileDto> {
    return this.accountProfileService.create({
      handle: String(body?.handle ?? ''),
      groupTag: typeof body?.groupTag === 'string' ? body.groupTag : null,
      monitorEnabled:
        typeof body?.monitorEnabled === 'boolean' ? body.monitorEnabled : true,
    });
  }

  @Patch(':handle')
  update(
    @Param('handle') handle: string,
    @Body()
    body: {
      groupTag?: string | null;
      monitorEnabled?: boolean;
      region?: string | null;
      accountType?: string | null;
      displayName?: string | null;
      bio?: string | null;
      isActive?: boolean;
    },
  ): Promise<AccountProfileDto> {
    return this.accountProfileService.update(handle, {
      groupTag: typeof body?.groupTag === 'string' ? body.groupTag : undefined,
      monitorEnabled:
        typeof body?.monitorEnabled === 'boolean' ? body.monitorEnabled : undefined,
      region: typeof body?.region === 'string' ? body.region : undefined,
      accountType:
        typeof body?.accountType === 'string' ? body.accountType : undefined,
      displayName:
        typeof body?.displayName === 'string' ? body.displayName : undefined,
      bio: typeof body?.bio === 'string' ? body.bio : undefined,
      isActive: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
    });
  }

  @Delete(':handle')
  async remove(@Param('handle') handle: string): Promise<{ deleted: true }> {
    await this.accountProfileService.remove(handle);
    return { deleted: true };
  }

  @Get(':handle')
  findOne(@Param('handle') handle: string): Promise<AccountProfileDto> {
    return this.accountProfileService.findByHandle(handle);
  }
}
