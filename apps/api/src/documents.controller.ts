import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { User } from './auth';
import { CurrentUser } from './auth.decorators';
import { DocumentsService } from './documents.service';
import { CreateItemDto, PatchItemDto } from './dto';
import { TransferService } from './transfer.service';

@Controller('items')
export class DocumentsController {
  constructor(private readonly service: DocumentsService, private readonly transfers:TransferService) {}
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
  @Post('upload/sessions') start(@CurrentUser() user:User,@Body() body:{id?:string;name:string;size:number;parentId?:string|null}) {
    return this.transfers.start(user.id,body);
  }
  @Get('upload/sessions/:id') uploadStatus(@CurrentUser() user:User,@Param('id') id:string) {
    return this.transfers.status(user.id,id);
  }
  @Post('upload/sessions/:id/chunk')
  async uploadChunk(@CurrentUser() user:User,@Param('id') id:string,@Query('offset') rawOffset:string,@Headers('x-chunk-sha256') digest:string,@Req() req:Request) {
    const parts:Buffer[] = []; let length = 0;
    for await (const part of req) {
      length += part.length;
      if (length > 8 * 1024 * 1024) throw new BadRequestException('分片不能超过 8 MB');
      parts.push(Buffer.from(part));
    }
    return this.transfers.chunk(user.id,id,Number(rawOffset),Buffer.concat(parts),digest ?? '');
  }
  @Post('upload/sessions/:id/finish') finishUpload(@CurrentUser() user:User,@Param('id') id:string) {
    return this.transfers.finish(user.id,id);
  }
  @Post('upload/sessions/:id/parts/:number/sign') signPart(@CurrentUser() user:User,@Param('id') id:string,@Param('number') number:string) {
    return this.transfers.signPart(user.id,id,Number(number));
  }
  @Get(':id/download-ticket') downloadTicket(@CurrentUser() user:User,@Param('id') id:string) {
    return this.service.downloadTicket(user.id,id);
  }
  @Get(':id/file') @Header('X-Content-Type-Options','nosniff')
  async getFile(@CurrentUser() user:User,@Param('id') id:string,@Query('download') download:string,@Headers('range') range:string|undefined,@Res() res:Response) {
    const file = await this.service.fileInfo(user.id,id);
    // 禁止把 HTML 文件直接以可执行网页形式加载到本站源，下载作为附件。
    const safeInline = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mime);
    res.setHeader('Content-Type',file.mime);
    res.setHeader('Content-Disposition',`${download==='1'||!safeInline?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Cache-Control','private,no-store');
    res.setHeader('Accept-Ranges','bytes');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return res.status(416).end();
      const start = Number(match[1]), requestedEnd = match[2] ? Number(match[2]) : start+4*1024*1024-1;
      const end = Math.min(requestedEnd,file.size-1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= file.size || end < start || requestedEnd-start+1 > 4*1024*1024)
        return res.status(416).end();
      const data = await this.service.fileRange(user.id,id,start,end);
      res.status(206).setHeader('Content-Range',`bytes ${start}-${end}/${file.size}`);
      res.setHeader('Content-Length',data.length);
      return res.send(data);
    }
    const full = await this.service.file(user.id,id);
    res.setHeader('Content-Length',full.data.length);
    return res.send(full.data);
  }
}
