import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { PdfTextPage, PdfOutlineEntry } from '@studydocs/shared';
import { CurrentUser } from './auth.decorators';
import type { User } from './auth';
import { PdfLayoutService } from './pdf-layout.service';
import { PdfOutlineService } from './pdf-outline.service';
@Controller('items/:id/pdf-outline')
export class PdfOutlineController {
  constructor(private readonly outlines: PdfOutlineService, private readonly layout: PdfLayoutService) {}
  @Get() get(@CurrentUser() user: User, @Param('id') id: string) { return this.outlines.get(user.id, id); }
  @Get('layout') getLayout(@CurrentUser() user: User, @Param('id') id: string) { return { job: this.layout.get(user.id, id) }; }
  @Post('layout') startLayout(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { forceOcr?: boolean }) { return this.layout.start(user.id, id, input); }
  @Post('generate') generate(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { pages: PdfTextPage[]; pageCount: number }) { return this.outlines.start(user.id, id, input); }
  @Post('recognize-page') recognize(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { image: string; engine: 'local' | 'vision'; language: string }) { return this.outlines.recognize(user.id, id, input); }
  @Post('body-page') bodyPage(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { page: number; text?: string; image?: string; language: string }) { return this.outlines.bodyPage(user.id, id, input); }
  @Patch('draft') draft(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { entries: PdfOutlineEntry[]; baseUpdatedAt: string | null; updatedAt: string | null }) { return this.outlines.saveDraft(user.id, id, input); }
  @Post('resume') resume(@CurrentUser() user: User, @Param('id') id: string) { return this.outlines.resume(user.id, id); }
  @Patch() save(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { entries: unknown; pageCount: number; updatedAt: string | null; draftUpdatedAt?: string | null }) { return this.outlines.save(user.id, id, input); }
}
