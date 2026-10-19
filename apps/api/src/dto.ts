import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Min } from 'class-validator';
import type { ItemKind } from '@studydocs/shared';

const names: ItemKind[] = ['folder', 'markdown', 'richtext', 'web'];
export class CreateItemDto {
  @IsIn(names) kind!: 'folder' | 'markdown' | 'richtext' | 'web';
  @IsString() @Length(1, 140) name!: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url?: string;
}
export class PatchItemDto {
  @IsOptional() @IsString() @Length(1, 140) name?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url?: string;
  @IsOptional() @IsBoolean() starred?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
