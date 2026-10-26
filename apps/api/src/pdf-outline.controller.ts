import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { PdfTextPage } from '@studydocs/shared';
import { CurrentUser } from './auth.decorators';
import type { User } from './auth';
import { PdfOutlineService } from './pdf-outline.service';
@Controller('items/:id/pdf-outline')
export class PdfOutlineController {
  constructor(private readonly outlines: PdfOutlineService) {}
  @Get() get(@CurrentUser() user: User, @Param('id') id: string) { return this.outlines.get(user.id, id); }
  @Post('generate') generate(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { pages: PdfTextPage[]; pageCount: number }) { return this.outlines.start(user.id, id, input); }
  @Patch() save(@CurrentUser() user: User, @Param('id') id: string, @Body() input: { entries: unknown; pageCount: number; updatedAt: string | null }) { return this.outlines.save(user.id, id, input); }
}
