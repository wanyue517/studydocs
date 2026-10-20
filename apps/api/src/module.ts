import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseService } from './database.service';
import { AuthController, AuthGuard, AuthService } from './auth';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SiteController, SiteService } from './site.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { TransferService } from './transfer.service';
@Module({
  controllers:[AuthController, DocumentsController, SiteController, StorageController],
  providers:[DatabaseService, SiteService, StorageService, AuthService, DocumentsService, TransferService, {provide:APP_GUARD,useClass:AuthGuard}],
})
export class AppModule {}
