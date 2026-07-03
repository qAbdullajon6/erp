import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/// "Authenticated user" guard — apply to any route that requires a valid
/// access token. See JwtStrategy for what counts as valid.
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
