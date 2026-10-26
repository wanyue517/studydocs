import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { AiProfileInput } from '@studydocs/shared';
import { AdminOnly } from './auth.decorators';
import { AiService } from './ai.service';
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get('availability') availability() { return this.ai.availability(); }
  @AdminOnly() @Get('profiles') list() { return this.ai.list(); }
  @AdminOnly() @Post('profiles') create(@Body() input: AiProfileInput) { return this.ai.save(input); }
  @AdminOnly() @Patch('profiles/:id') update(@Param('id') id: string, @Body() input: AiProfileInput) { return this.ai.save(input, id); }
  @AdminOnly() @Post('profiles/:id/activate') activate(@Param('id') id: string) { return this.ai.activate(id); }
  @AdminOnly() @Post('profiles/:id/test') test(@Param('id') id: string) { return this.ai.test(id); }
  @AdminOnly() @Delete('profiles/:id') remove(@Param('id') id: string) { return this.ai.remove(id); }
}
