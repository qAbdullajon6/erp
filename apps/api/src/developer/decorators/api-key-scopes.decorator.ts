import { SetMetadata } from "@nestjs/common";
import type { ApiKeyScope } from "../api-keys/dto/api-key.dto";

export const API_KEY_SCOPES_KEY = "apiKeyScopes";

/// Declares the scopes an API key must hold to reach a route. Read by
/// ApiKeyGuard. A route with no @RequireApiKeyScopes(...) needs only a valid
/// key — same opt-in shape as @Roles(...)/RolesGuard.
export const RequireApiKeyScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);
