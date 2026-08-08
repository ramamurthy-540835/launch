export type RegistrationIntake = {
  contactName: string;
  contactDesignation: string | null;
  contactPhone: string;
  contactEmail: string | null;
  strength: number | null;
  expectedLunchUsers: number | null;
  workingDays: string | null;
  consentGiven: true;
};

function text(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

function optionalInteger(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
}

export function validateRegistrationIntake(body: Record<string, unknown>, options: { strengthField: string; strengthLabel: string }): { data?: RegistrationIntake; error?: string } {
  const contactName = text(body, "contact_name", 120);
  const rawPhone = text(body, "contact_phone", 18);
  const normalizedPhone = rawPhone.replace(/[\s-]/g, "");
  const contactEmail = text(body, "contact_email", 160);
  const strength = optionalInteger(body[options.strengthField]);
  const expectedLunchUsers = optionalInteger(body.expected_lunch_users);
  const consent = body.consent === true || body.consent === "true" || body.consent === "on";

  if (contactName.length < 2) return { error: "Enter the name of the person LunchBox should contact." };
  if (!/^(?:\+91)?[6-9]\d{9}$/.test(normalizedPhone)) return { error: "Enter a valid Indian mobile number." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Enter a valid email address." };
  if (Number.isNaN(strength) || strength === 0) return { error: `${options.strengthLabel} must be a positive whole number when provided.` };
  if (Number.isNaN(expectedLunchUsers)) return { error: "Expected lunch users must be zero or a positive whole number." };
  if (strength !== null && expectedLunchUsers !== null && expectedLunchUsers > strength) return { error: `Expected lunch users cannot exceed ${options.strengthLabel.toLowerCase()}.` };
  if (!consent) return { error: "Confirm that LunchBox may contact you about this registration." };

  return { data: {
    contactName, contactDesignation: text(body, "contact_designation", 120) || null,
    contactPhone: normalizedPhone, contactEmail: contactEmail || null, strength, expectedLunchUsers,
    workingDays: text(body, "working_days", 40) || null, consentGiven: true,
  } };
}
