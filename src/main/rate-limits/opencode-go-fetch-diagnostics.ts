const LOG_PREFIX = '[opencode-go-rate-limits]'

type WorkspaceDiagnostic = {
  workspaceLength: number
  workspaceSuffix: string
}

type TransportErrorDiagnostic = {
  name: string
  message: string
  code?: string
  cause?: Omit<TransportErrorDiagnostic, 'cause'>
}

export function logInfo(event: string, details: object): void {
  console.info(`${LOG_PREFIX} ${event}`, details)
}

export function logWarning(event: string, details: object): void {
  console.warn(`${LOG_PREFIX} ${event}`, details)
}

export function workspaceDiagnostic(workspaceId: string): WorkspaceDiagnostic {
  return {
    workspaceLength: workspaceId.length,
    workspaceSuffix: workspaceId.length > 8 ? workspaceId.slice(-4) : '[REDACTED]'
  }
}

export function credentialFragments(...inputs: string[]): string[] {
  const fragments = new Set<string>()
  for (const input of inputs) {
    if (input) {
      fragments.add(input)
    }
    for (const pair of input.split(';')) {
      const separator = pair.indexOf('=')
      const value = separator >= 0 ? pair.slice(separator + 1).trim() : pair.trim()
      if (value) {
        fragments.add(value)
      }
    }
  }
  return [...fragments].sort((left, right) => right.length - left.length)
}

function redactDiagnosticText(text: string, credentials: string[]): string {
  let redacted = text
  // Why: Electron transport errors can echo request URLs or caller-provided values.
  for (const credential of credentials) {
    redacted = redacted.replaceAll(credential, '[REDACTED]')
  }
  return redacted
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/\b(?:wrk|wk)_[A-Za-z0-9]+\b/g, '[REDACTED_WORKSPACE]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[REDACTED_AUTHORIZATION]')
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]'
    )
}

function readProperty(value: unknown, property: 'name' | 'message' | 'code' | 'cause'): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined
  }
  try {
    return (value as Record<string, unknown>)[property]
  } catch {
    return undefined
  }
}

function diagnosticString(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

export function transportErrorDiagnostic(
  error: unknown,
  credentials: string[]
): TransportErrorDiagnostic {
  const name = redactDiagnosticText(
    diagnosticString(readProperty(error, 'name'), 'Error'),
    credentials
  )
  const message = redactDiagnosticText(
    diagnosticString(readProperty(error, 'message'), 'Unknown error'),
    credentials
  )
  const codeValue = readProperty(error, 'code')
  const code =
    typeof codeValue === 'string' || typeof codeValue === 'number'
      ? redactDiagnosticText(String(codeValue), credentials)
      : undefined
  const causeValue = readProperty(error, 'cause')
  const cause = causeValue
    ? {
        name: redactDiagnosticText(
          diagnosticString(readProperty(causeValue, 'name'), 'Error'),
          credentials
        ),
        message: redactDiagnosticText(
          diagnosticString(
            readProperty(causeValue, 'message'),
            diagnosticString(causeValue, 'Unknown error')
          ),
          credentials
        ),
        ...(readProperty(causeValue, 'code') !== undefined
          ? {
              code: redactDiagnosticText(
                diagnosticString(readProperty(causeValue, 'code'), 'Unknown'),
                credentials
              )
            }
          : {})
      }
    : undefined

  return { name, message, ...(code ? { code } : {}), ...(cause ? { cause } : {}) }
}
