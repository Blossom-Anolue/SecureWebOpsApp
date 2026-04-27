export function validatePassword(password: string) {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("At least 10 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("1 uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("1 lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("1 number");
  }

  if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
    errors.push("1 special character");
  }

  return errors;
}
