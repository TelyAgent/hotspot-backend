import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ContentDraftRepository } from './draft/content-draft.repository';
import { ContentGenerationAgentService } from './generation/content-generation-agent.service';
import { HotspotOperationService } from './hotspot-operation/hotspot-operation.service';

@Controller()
export class ContentController {
  constructor(
    private readonly contentDraftRepository: ContentDraftRepository,
    private readonly contentGenerationAgentService: ContentGenerationAgentService,
    private readonly hotspotOperationService: HotspotOperationService,
  ) {}

  @Get('content-tasks/:id/drafts')
  listDrafts(@Param('id') id: string) {
    return this.contentDraftRepository.listByTask(id);
  }

  @Post('content-drafts/generate')
  generate(@Body() body: Record<string, unknown>) {
    return this.contentGenerationAgentService.generate({
      contentTask: body.contentTask as never,
      accountPersona: String(body.accountPersona ?? ''),
      contentRules: String(body.contentRules ?? ''),
      generationPrompt: body.generationPrompt
        ? String(body.generationPrompt)
        : undefined,
      evidence: Array.isArray(body.evidence) ? body.evidence : [],
      userInstruction: body.userInstruction
        ? String(body.userInstruction)
        : undefined,
    });
  }

  @Get('hotspot-operation/events/:eventId/drafts')
  listHotspotDrafts(@Param('eventId') eventId: string) {
    return this.hotspotOperationService.listDrafts(eventId);
  }

  @Post('hotspot-operation/events/:eventId/drafts/generate')
  generateHotspotPosts(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.hotspotOperationService.generatePosts({
      eventId,
      userInstruction:
        typeof body.userInstruction === 'string'
          ? body.userInstruction
          : undefined,
    });
  }

  @Post('hotspot-operation/events/:eventId/publish')
  publishHotspotPost(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.hotspotOperationService.publish({
      eventId,
      draftId: String(body.draftId ?? ''),
      url: String(body.url ?? ''),
      accountName: String(body.accountName ?? ''),
    });
  }
}
