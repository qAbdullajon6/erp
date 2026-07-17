export interface IntegrationProviderInfo {
  providerKey: string;
  displayName: string;
  type: string;
  description: string;
  capabilities: string[];
  configurationSchema: Record<string, unknown>;
}

export interface IntegrationInstance {
  id: string;
  type: string;
  providerKey: string;
  displayName: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'EXPIRED';
  metadata: Record<string, unknown> | null;
  errorMessage: string | null;
  lastSyncAt: string | null;
  syncCount: number;
  errorCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationHealthStatus {
  connected: boolean;
  latencyMs: number | null;
  lastSyncAt: string | null;
  errorCount: number;
  lastError: string | null;
  details?: Record<string, unknown>;
}

export interface IntegrationOverallHealth {
  summary: { total: number; healthy: number; degraded: number; failed: number };
  providers: Array<IntegrationInstance & IntegrationHealthStatus>;
}

export interface IntegrationLogEntry {
  id: string;
  integrationId: string;
  event: string;
  message: string | null;
  level: string;
  createdAt: string;
}

export interface IntegrationConnectInput {
  providerKey: string;
  config: Record<string, unknown>;
  displayName?: string;
}

export interface IntegrationSyncResult {
  success: boolean;
  recordsProcessed: number;
  errors: string[];
}

export interface IntegrationTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
}
