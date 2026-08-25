import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ContentDraftRepository } from './draft/content-draft.repository';
import { ContentGenerationAgentService } from './generation/content-generation-agent.service';

@Controller()
export class ContentController {
  constructor(
    private readonly contentDraftRepository: ContentDraftRepository,
    private readonly contentGenerationAgentService: ContentGenerationAgentService,
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
}
