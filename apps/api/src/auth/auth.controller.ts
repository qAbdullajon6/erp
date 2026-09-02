import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { AUTH_THROTTLE, resolveAuthThrottle } from "./auth-throttle";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ValidateResetTokenDto } from "./dto/validate-reset-token.dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { CurrentUserPayload } from "./interfaces/current-user.interface";

const AUTH_REFRESH_THROTTLE = resolveAuthThrottle({
  ...process.env,
  // Refresh is slightly looser than login in every environment (historical: 10/min prod).
  AUTH_THROTTLE_LIMIT:
    process.env.AUTH_REFRESH_THROTTLE_LIMIT ??
    (process.env.NODE_ENV === "production" ? "10" : process.env.AUTH_THROTTLE_LIMIT ?? "400"),
});

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
  @Throttle(AUTH_REFRESH_THROTTLE)
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, { ip: req.ip });
  }

  @Post("forgot-password")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto, { ip: req.ip });
    return {
      success: true,
      message: "If an eligible account exists, a password reset link has been sent.",
    };
  }

  @Post("reset-password/validate")
  @Throttle(AUTH_REFRESH_THROTTLE)
  @HttpCode(200)
  validateResetToken(@Body() dto: ValidateResetTokenDto) {
    return this.authService.validateResetToken(dto);
  }

  @Post("reset-password")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.authService.resetPassword(dto, { ip: req.ip });
    return { success: true };
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
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: CurrentUserPayload) {
    await this.authService.changePassword(dto, user);
    return { success: true };
  }
}
