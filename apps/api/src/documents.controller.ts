import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { User } from './auth';
import { CurrentUser } from './auth.decorators';
import { DocumentsService } from './documents.service';
import { CreateItemDto, PatchItemDto } from './dto';

@Controller('items')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}
  @Get() list(@CurrentUser() user:User, @Query('trash') trash?:string) { return this.service.list(user.id,trash==='true'); }
  @Get(':id') find(@CurrentUser() user:User,@Param('id') id:string) { return this.service.find(user.id,id); }
  @Post() create(@CurrentUser() user:User,@Body() dto:CreateItemDto) { return this.service.create(user.id,dto); }
  @Patch(':id') patch(@CurrentUser() user:User,@Param('id') id:string,@Body() dto:PatchItemDto) { return this.service.patch(user.id,id,dto); }
  @Delete(':id') trash(@CurrentUser() user:User,@Param('id') id:string) { return this.service.trash(user.id,id); }
  @Post(':id/restore') restore(@CurrentUser() user:User,@Param('id') id:string) { return this.service.restore(user.id,id); }
  @Delete(':id/forever') forever(@CurrentUser() user:User,@Param('id') id:string) { return this.service.removeForever(user.id,id); }
  @Post('upload/file') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:25*1024*1024}}))
  upload(@CurrentUser() user:User,@UploadedFile() file:Express.Multer.File,@Body('parentId') parentId?:string,@Body('fileName') fileName?:string) {
    if (!file) throw new BadRequestException('请选择不超过 25MB 的文件');
    return this.service.upload(user.id,file,parentId||null,fileName);
  }
  @Get(':id/file') @Header('X-Content-Type-Options','nosniff')
  async getFile(@CurrentUser() user:User,@Param('id') id:string,@Query('download') download:string,@Res() res:Response) {
    const file = await this.service.file(user.id,id);
    // 禁止把 HTML 文件直接以可执行网页形式加载到本站源，下载作为附件。
    const safeInline = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mime);
    res.setHeader('Content-Type',file.mime);
    res.setHeader('Content-Disposition',`${download==='1'||!safeInline?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Cache-Control','private,no-store');
    res.send(file.data);
  }
}
