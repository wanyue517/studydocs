import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminOnly } from './auth.decorators';
import { StorageService, ProfileInput } from './storage.service';
@AdminOnly()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage:StorageService) {}
  @Get() list() { return this.storage.list(); }
  @Post() create(@Body() input:ProfileInput) { return this.storage.create(input); }
  @Patch(':id') update(@Param('id') id:string,@Body() input:ProfileInput) { return this.storage.update(id,input); }
  @Post(':id/activate') activate(@Param('id') id:string) { return this.storage.activate(id); }
  @Post(':id/test') test(@Param('id') id:string) { return this.storage.test(id); }
  @Delete(':id') remove(@Param('id') id:string) { return this.storage.remove(id); }
}
