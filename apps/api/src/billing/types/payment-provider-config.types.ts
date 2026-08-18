export interface StripeProviderConfig {
  secretKey: string;
}

export interface ClickProviderConfig {
  merchantId: string;
  serviceId: string;
  secretKey: string;
  merchantUserId: string;
}

export interface PaymeProviderConfig {
  merchantId: string;
  secretKey: string;
}

export type DecryptedPaymentProviderConfig =
  | StripeProviderConfig
  | ClickProviderConfig
  | PaymeProviderConfig;

export function isStripeConfig(config: DecryptedPaymentProviderConfig): config is StripeProviderConfig {
  return "secretKey" in config && !("merchantId" in config);
}

export function isClickConfig(config: DecryptedPaymentProviderConfig): config is ClickProviderConfig {
  return "serviceId" in config && "merchantUserId" in config;
}

export function isPaymeConfig(config: DecryptedPaymentProviderConfig): config is PaymeProviderConfig {
  return "merchantId" in config && "secretKey" in config && !("serviceId" in config);
}
