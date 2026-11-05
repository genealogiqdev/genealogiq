export type BusinessCodeState = 'available' | 'assigned' | 'activated' | 'expired' | 'returned'
export function getBusinessCodeState(code: {
  status: string; soldAt: Date | null; soldToAppUserId: string | null;
  reservation: { status: string; expiresAt: Date | null } | null;
}, now = new Date()): BusinessCodeState {
  if (!code.soldAt || code.status === 'AVAILABLE') return 'returned'
  if (code.status === 'ACTIVATED') return 'activated'
  if (!code.reservation || code.reservation.status !== 'HELD'
    || (code.reservation.expiresAt && code.reservation.expiresAt <= now)) return 'expired'
  return code.soldToAppUserId ? 'assigned' : 'available'
}
