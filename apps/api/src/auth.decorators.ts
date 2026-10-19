import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { User, AuthRequest } from './auth';
export const Public = () => SetMetadata('public', true);
export const AdminOnly = () => SetMetadata('admin', true);
export const CurrentUser = createParamDecorator((_data:unknown, ctx:ExecutionContext):User => ctx.switchToHttp().getRequest<AuthRequest>().authUser);
