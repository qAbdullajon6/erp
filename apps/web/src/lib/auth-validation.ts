/// Pure validation helpers mirroring apps/api's class-validator DTOs
/// (RegisterDto/LoginDto) exactly, so the frontend rejects obviously-invalid
/// input before making a round trip, with the same limits the API enforces.
/// Kept dependency-free and framework-free on purpose — this repo has no
/// frontend test runner yet, but these are the natural first candidates to
/// unit-test once one exists (see docs/CONNECTED_MODE_AUTH_UI.md).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`;
  }
  return null;
}

export function nameError(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) return `${label} is required`;
  if (trimmed.length > 100) return `${label} must be at most 100 characters`;
  return null;
}

export function organizationNameError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) return "Organization name is required";
  if (trimmed.length > 200) return "Organization name must be at most 200 characters";
  return null;
}

export interface RegisterFormValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  organizationName: string;
}

export interface RegisterFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  organizationName?: string;
}

export function validateRegisterForm(values: RegisterFormValues): RegisterFormErrors {
  const errors: RegisterFormErrors = {};

  const firstNameErr = nameError(values.firstName, "First name");
  if (firstNameErr) errors.firstName = firstNameErr;

  const lastNameErr = nameError(values.lastName, "Last name");
  if (lastNameErr) errors.lastName = lastNameErr;

  if (!isValidEmail(values.email)) errors.email = "Enter a valid email address";

  const passwordErr = passwordError(values.password);
  if (passwordErr) errors.password = passwordErr;

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match";
  }

  const orgErr = organizationNameError(values.organizationName);
  if (orgErr) errors.organizationName = orgErr;

  return errors;
}

export function hasErrors<T extends object>(errors: T): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}
