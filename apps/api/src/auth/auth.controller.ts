import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { CurrentUserPayload } from "./interfaces/current-user.interface";

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, { ip: req.ip });
  }

  @Post("login")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, { ip: req.ip });
  }

  @Post("refresh")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, { ip: req.ip });
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @CurrentUser() user: CurrentUserPayload) {
    await this.authService.logout(dto, user);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout-all")
  @HttpCode(200)
  logoutAll(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.logoutAll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: CurrentUserPayload) {
    await this.authService.changePassword(dto, user);
    return { success: true };
  }
}
