// =====================================================
// Phase 15A-B-3: Redaction and Sanitization Utility
// Sanitizes audit metadata, diffs, and payloads
// Zero external dependencies. Circular-reference safe.
// =====================================================

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'cardnumber',
  'cvv',
];

const DEFAULT_MAX_BYTES = 16 * 1024; // 16 KB

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

export function redactAuditPayload(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item, seen));
  }

  // Handle Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle standard Record/Object
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactAuditPayload(v, seen);
    } else {
      out[k] = v;
    }
  }

  return out;
}

export function sanitizeAuditMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const redacted = redactAuditPayload(value);
  if (typeof redacted === 'object' && redacted !== null && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return { data: redacted };
}

export function truncateAuditJson(value: unknown, maxBytes = DEFAULT_MAX_BYTES): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
      return value;
    }
    return {
      _truncated: true,
      summary: serialized.slice(0, maxBytes),
    };
  } catch {
    return '[UNSERIALIZABLE]';
  }
}
