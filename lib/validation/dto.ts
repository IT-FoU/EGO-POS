export class DtoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DtoValidationError";
  }
}

export type DtoObject = Record<string, unknown>;

type FieldOptions = {
  max?: number;
  min?: number;
  nullable?: boolean;
  required?: boolean;
};

export function asDtoObject(input: unknown, label: string): DtoObject {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DtoValidationError(`${label} must be an object.`);
  }

  return input as DtoObject;
}

export function rejectUnknownFields(input: DtoObject, allowedFields: string[], label: string) {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(input).filter((field) => !allowed.has(field));

  if (unknown.length > 0) {
    throw new DtoValidationError(`${label} contains unknown field(s): ${unknown.join(", ")}.`);
  }
}

export function parseString(input: DtoObject, key: string, options: FieldOptions = {}) {
  const value = input[key];

  if (value === undefined) {
    if (options.required) {
      throw new DtoValidationError(`${key} is required.`);
    }
    return undefined;
  }

  if (value === null) {
    if (options.nullable) {
      return null;
    }
    if (options.required) {
      throw new DtoValidationError(`${key} is required.`);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    throw new DtoValidationError(`${key} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed && options.required) {
    throw new DtoValidationError(`${key} is required.`);
  }

  if (options.max !== undefined && trimmed.length > options.max) {
    throw new DtoValidationError(`${key} must be ${options.max} characters or fewer.`);
  }

  if (options.min !== undefined && trimmed.length < options.min) {
    throw new DtoValidationError(`${key} must be at least ${options.min} characters.`);
  }

  return trimmed || (options.nullable ? null : undefined);
}

export function parseNumber(input: DtoObject, key: string, options: FieldOptions & { integer?: boolean } = {}) {
  const value = input[key];

  if (value === undefined || value === null || value === "") {
    if (options.required) {
      throw new DtoValidationError(`${key} is required.`);
    }
    return undefined;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new DtoValidationError(`${key} must be a number.`);
  }

  if (options.integer && !Number.isInteger(parsed)) {
    throw new DtoValidationError(`${key} must be an integer.`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new DtoValidationError(`${key} must be greater than or equal to ${options.min}.`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new DtoValidationError(`${key} must be less than or equal to ${options.max}.`);
  }

  return parsed;
}

export function parseBoolean(input: DtoObject, key: string, options: FieldOptions = {}) {
  const value = input[key];

  if (value === undefined || value === null) {
    if (options.required) {
      throw new DtoValidationError(`${key} is required.`);
    }
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new DtoValidationError(`${key} must be a boolean.`);
  }

  return value;
}

export function parseStringArray(input: DtoObject, key: string) {
  const value = input[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new DtoValidationError(`${key} must be an array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new DtoValidationError(`${key}[${index}] must be a non-empty string.`);
    }
    return item.trim();
  });
}

export function parseEnum<T extends string>(
  input: DtoObject,
  key: string,
  values: readonly T[],
  options: FieldOptions = {},
) {
  const value = parseString(input, key, options);

  if (value === undefined || value === null) {
    return value;
  }

  if (!values.includes(value as T)) {
    throw new DtoValidationError(`${key} must be one of: ${values.join(", ")}.`);
  }

  return value as T;
}

export function parseDateString(input: DtoObject, key: string, options: FieldOptions = {}) {
  const value = parseString(input, key, options);

  if (value === undefined || value === null) {
    return value;
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new DtoValidationError(`${key} must be a valid date.`);
  }

  return value;
}

export function cleanUndefined<T extends DtoObject>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
