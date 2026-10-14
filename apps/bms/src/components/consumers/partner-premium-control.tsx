'use client'

import { PremiumAccessControl } from '@genealogiq/ui/premium-access-control'
import { grantPartnerPremium, revokePartnerPremium } from '@/actions/partner-consumer.actions'

export function PartnerPremiumControl({ appUserId, consumerName, grantId, canGrant }: {
  appUserId: string; consumerName: string; grantId: string | null; canGrant: boolean
}) {
  return <PremiumAccessControl consumerName={consumerName} grantId={grantId} canGrant={canGrant}
    grant={(requestId) => grantPartnerPremium(appUserId, requestId)} revoke={(id) => revokePartnerPremium(appUserId, id)} />
}
