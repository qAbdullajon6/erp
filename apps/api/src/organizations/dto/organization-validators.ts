import { registerDecorator, type ValidationOptions } from "class-validator";
import { isActiveIso4217Code } from "../../orders/currency-codes.util";
import { isSupportedTimezone } from "../timezone.util";

/// Both validators intentionally pass through `undefined`/`null`/`""` and let
/// `@IsOptional` (and the service's empty-string folding) decide what those
/// mean, so they only ever judge a value the caller actually supplied.
function skipsBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/// The allowlist is shared with order pricing rather than re-listed here, so a
/// currency an order can be priced in is exactly a currency an organization can
/// default to.
export function IsActiveCurrencyCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isActiveCurrencyCode",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          skipsBlank(value) || (typeof value === "string" && isActiveIso4217Code(value)),
        defaultMessage: () =>
          "defaultCurrency must be an active ISO 4217 currency code, e.g. USD or UZS",
      },
    });
  };
}

export function IsSupportedTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isSupportedTimezone",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) =>
          skipsBlank(value) || (typeof value === "string" && isSupportedTimezone(value)),
        defaultMessage: () => "timezone must be a valid IANA timezone name, e.g. Asia/Tashkent",
      },
    });
  };
}
