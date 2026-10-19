import { BadRequestException, Controller, Get, Injectable, Patch, Body, Post, UploadedFile, UseInterceptors, Res, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DatabaseService } from './database.service';
import { StorageService } from './storage.service';
import { AdminOnly, Public } from './auth.decorators';

export interface SiteSettings { siteName:string; siteSubtitle:string; footerText:string; icpNumber:string; policeRecordNumber:string; loginNotice:string; allowRegistration:boolean; maxUploadMb:number; logoStorageId:string|null; logoObjectKey:string|null; }
@Injectable()
export class SiteService {
  constructor(private readonly database: DatabaseService) {}
  get(): SiteSettings { const row = this.database.db.prepare('SELECT data FROM site_settings WHERE id=1').get() as {data:string}; return JSON.parse(row.data); }
  publicInfo() { const {siteName, siteSubtitle, footerText, icpNumber, policeRecordNumber, loginNotice, allowRegistration, logoObjectKey} = this.get();
    return {siteName, siteSubtitle, footerText, icpNumber, policeRecordNumber, loginNotice, allowRegistration, logoUrl:logoObjectKey ? '/api/site/logo' : null}; }
  patch(input: Partial<SiteSettings>) {
    const permitted = ['siteName','siteSubtitle','footerText','icpNumber','policeRecordNumber','loginNotice','allowRegistration','maxUploadMb'];
    if (!input || typeof input !== 'object' || Object.keys(input).some((k) => !permitted.includes(k))) throw new BadRequestException('包含不支持的配置');
    const next = {...this.get()};
    for (const field of permitted) {
      const val = input[field as keyof SiteSettings];
      if (val === undefined) continue;
      if (field === 'allowRegistration') { if (typeof val !== 'boolean') throw new BadRequestException('注册开关无效'); next.allowRegistration = val; }
      else if (field === 'maxUploadMb') { if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 25) throw new BadRequestException('上传限制必须为 1-25MB'); next.maxUploadMb = Number(val); }
      else {
        if (typeof val !== 'string' || val.length > (field === 'loginNotice' ? 500 : 140)) throw new BadRequestException('站点配置长度超限');
        (next as unknown as Record<string,unknown>)[field] = val.trim();
      }
    }
    if (!next.siteName) throw new BadRequestException('站点名称不能为空');
    this.database.db.prepare('UPDATE site_settings SET data=? WHERE id=1').run(JSON.stringify(next));
    return next;
  }
  setLogo(storageId: string, key: string) {
    const next = {...this.get(),logoStorageId:storageId,logoObjectKey:key};
    this.database.db.prepare('UPDATE site_settings SET data=? WHERE id=1').run(JSON.stringify(next));
    return this.publicInfo();
  }
  clearLogo() {
    const next = {...this.get(),logoStorageId:null,logoObjectKey:null};
    this.database.db.prepare('UPDATE site_settings SET data=? WHERE id=1').run(JSON.stringify(next));
    return this.publicInfo();
  }
}
@Controller('site')
export class SiteController {
  constructor(private readonly site:SiteService,private readonly storage:StorageService) {}
  @Public() @Get('public') publicInfo() { return this.site.publicInfo(); }
  @AdminOnly() @Get('settings') settings() { return this.site.get(); }
  @AdminOnly() @Patch('settings') update(@Body() body:Partial<SiteSettings>) { return this.site.patch(body); }
  @AdminOnly() @Post('logo') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:2*1024*1024}}))
  async uploadLogo(@UploadedFile() file:Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择不超过 2MB 的图片');
    const png = file.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = file.buffer.subarray(0,3).equals(Buffer.from([255,216,255]));
    const webp = file.buffer.subarray(0,4).toString() === 'RIFF' && file.buffer.subarray(8,12).toString() === 'WEBP';
    if (!png && !jpeg && !webp) throw new BadRequestException('Logo 只支持 PNG/JPG/WebP，不支持 SVG');
    const ext = png ? '.png' : jpeg ? '.jpg' : '.webp';
    const stored = await this.storage.upload(file.buffer, ext, png?'image/png':jpeg?'image/jpeg':'image/webp');
    return this.site.setLogo(stored.storageId,stored.objectKey);
  }
  @AdminOnly() @Post('logo/clear') clear() { return this.site.clearLogo(); }
  @Public() @Get('logo') @Header('X-Content-Type-Options','nosniff')
  async logo(@Res() res:Response) {
    const config = this.site.get();
    if (!config.logoObjectKey) return res.status(404).end();
    const key = config.logoObjectKey;
    const data = await this.storage.read(config.logoStorageId,key);
    res.type(key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg');
    res.setHeader('Cache-Control','public,max-age=300');
    return res.send(data);
  }
}
