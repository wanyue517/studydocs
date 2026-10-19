import { BadRequestException, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Post, Body, Req, Res, UnauthorizedException, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { DatabaseService } from './database.service';
import { SiteService } from './site.service';
import { IsString } from 'class-validator';
import { Public, CurrentUser } from './auth.decorators';

export type User = { id: string; username: string; role: 'admin' | 'user' };
export type AuthRequest = Request & { authUser: User };
const COOKIE = 'studydocs_session';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function passwordHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password: string, stored: string) {
  const [algo, hexSalt, hexKey] = stored.split(':');
  if (algo !== 'scrypt' || !hexSalt || !hexKey) return false;
  const expected = Buffer.from(hexKey, 'hex');
  if (expected.length !== 64) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(hexSalt, 'hex'), 64), expected);
}
function validCredentials(username: string, password: string) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username) || password.length < 10 || password.length > 128)
    throw new BadRequestException('用户名需为 3-32 位字母/数字/下划线，密码需为 10-128 位');
}
@Injectable()
export class AuthService {
  private readonly attempts = new Map<string,{count:number;until:number}>();
  constructor(private readonly database: DatabaseService, private readonly site: SiteService) {
    const db = database.db;
    if (!(db.prepare('SELECT id FROM users LIMIT 1').get())) {
      const username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD;
      if (!username || !password) throw new Error('首次启动必须通过 ADMIN_USERNAME 和 ADMIN_PASSWORD 环境变量初始化管理员（密码至少 10 位）');
      validCredentials(username, password);
      const adminId = randomUUID();
      db.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)')
        .run(adminId, username, passwordHash(password), 'admin', new Date().toISOString());
      // 旧版单用户资料归属首次创建的管理员；不会删除、移动或覆盖任何旧文件。
      db.prepare('UPDATE items SET owner_id=? WHERE owner_id IS NULL').run(adminId);
    }
  }
  getUser(id: string): User | null {
    return (this.database.db.prepare('SELECT id,username,role FROM users WHERE id=?').get(id) as User | undefined) ?? null;
  }
  auth(token?: string): User | null {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const row = this.database.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at > ?')
      .get(hash(token), new Date().toISOString()) as {user_id:string} | undefined;
    return row ? this.getUser(row.user_id) : null;
  }
  login(username: string, password: string, res: Response, remoteAddress = 'local') {
    const key = `${remoteAddress}:${username}`, nowMs=Date.now();
    const attempt = this.attempts.get(key);
    if (attempt && attempt.until > nowMs && attempt.count>=8) throw new HttpException('尝试次数过多，请 15 分钟后重试',429);
    const row = this.database.db.prepare('SELECT * FROM users WHERE username=?').get(username) as (User & {password_hash:string}) | undefined;
    // 使用固定耗时的 scrypt 检查避免暴露用户名是否存在。
    if (!verifyPassword(password, row?.password_hash ?? passwordHash('dummy-password'))) {
      this.attempts.set(key,{count:(attempt?.until && attempt.until>nowMs ? attempt.count : 0)+1,until:nowMs+15*60_000});
      throw new UnauthorizedException('账号或密码错误');
    }
    this.attempts.delete(key);
    if (!row) throw new UnauthorizedException('账号或密码错误');
    const token = randomBytes(32).toString('hex'), now = new Date();
    this.database.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
    this.database.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(hash(token), row.id, new Date(now.getTime() + WEEK).toISOString(), now.toISOString());
    res.cookie(COOKIE, token, { httpOnly:true, secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production', sameSite:'lax', maxAge:WEEK, path:'/' });
    return { id:row.id, username:row.username, role:row.role };
  }
  changePassword(user: User, oldPassword:string, newPassword:string, token?:string) {
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length<10 || newPassword.length>128) throw new BadRequestException('新密码长度需为 10-128 位');
    const row = this.database.db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as {password_hash:string};
    if (!verifyPassword(oldPassword,row.password_hash)) throw new BadRequestException('原密码错误');
    this.database.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(newPassword),user.id);
    // 修改密码后撤销其他浏览器登录状态，当前浏览器无需重新登录。
    if (token) this.database.db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id,hash(token));
    else this.database.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    return {success:true};
  }
  logout(req: Request, res: Response) {
    const token = cookieToken(req);
    if (token) this.database.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
    res.clearCookie(COOKIE, { httpOnly:true, secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production', sameSite:'lax', path:'/' });
    return { success:true };
  }
  register(username: string, password: string) {
    if (!this.site.get().allowRegistration) throw new ForbiddenException('管理员已关闭开放注册');
    validCredentials(username, password);
    try {
      const id = randomUUID();
      this.database.db.prepare('INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)')
        .run(id, username, passwordHash(password), 'user', new Date().toISOString());
      return { id, username, role:'user' as const };
    } catch { throw new BadRequestException('用户名已被使用'); }
  }
}
export function cookieToken(req: Request) {
  const raw = req.headers.cookie ?? '';
  return raw.split(';').map((s) => s.trim()).find((x) => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    // 防止跨站诱导浏览器发出带 cookie 的写入操作，允许来自配置的前端 Origin。
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      const allowed = process.env.WEB_ORIGIN || 'http://localhost:5173';
      if (origin && origin !== allowed && origin !== `${request.protocol}://${request.get('host')}`) throw new ForbiddenException('非法请求来源');
    }
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const user = this.auth.auth(cookieToken(request));
    if (!user) throw new UnauthorizedException('登录已过期，请重新登录');
    request.authUser = user;
    if (this.reflector.getAllAndOverride<boolean>('admin', [context.getHandler(), context.getClass()]) && user.role !== 'admin')
      throw new ForbiddenException('仅管理员可操作');
    return true;
  }
}
class CredentialsDto { @IsString() username!: string; @IsString() password!: string; }
class ChangePasswordDto { @IsString() oldPassword!: string; @IsString() newPassword!: string; }
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') login(@Body() dto: CredentialsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (typeof dto.username !== 'string' || typeof dto.password !== 'string') throw new BadRequestException('请填写账号密码');
    return this.auth.login(dto.username, dto.password, res, req.ip ?? 'unknown');
  }
  @Public() @Post('register') register(@Body() dto: CredentialsDto) {
    if (typeof dto.username !== 'string' || typeof dto.password !== 'string') throw new BadRequestException('请填写账号密码');
    return this.auth.register(dto.username, dto.password);
  }
  @Get('me') me(@CurrentUser() user: User) { return user; }
  @Post('change-password') changePassword(@CurrentUser() user:User,@Req() req:Request,@Body() dto:ChangePasswordDto) {
    return this.auth.changePassword(user,dto.oldPassword,dto.newPassword,cookieToken(req));
  }
  @Post('logout') logout(@Req() req: Request, @Res({passthrough:true}) res: Response) { return this.auth.logout(req, res); }
}
