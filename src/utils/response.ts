/** Standardized JSON response helpers */

export function ok<T>(data: T, message?: string) {
  return { success: true, message: message ?? 'OK', data }
}

export function created<T>(data: T, message?: string) {
  return { success: true, message: message ?? 'Created', data }
}

export function fail(message: string, code?: string) {
  return { success: false, message, code }
}
