/** SUPER_ADMIN is the platform role and cannot be assigned by tenant staff. */
export function isBmsStaff(user: { role: string; tenantId: string | null }): boolean {
  return user.role === 'SUPER_ADMIN' || user.tenantId === null
}
