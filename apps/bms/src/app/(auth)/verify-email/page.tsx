import { getTranslations } from 'next-intl/server'
import { consumeEmailToken } from '@/lib/verify-email'
import { VerifyEmailCard } from '@/components/auth/verify-email-card'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams
  const t = await getTranslations('Auth')

  if (!token) {
    return (
      <VerifyEmailCard
        title={t('verify.checkTitle')}
        description={t('verify.checkDescription')}
        body={t('verify.checkBody')}
        buttonText={t('verify.goToSignIn')}
        buttonHref="/sign-in"
        buttonVariant="outline"
      />
    )
  }

  const outcome = await consumeEmailToken(token)

  if (outcome === 'invalid') {
    return (
      <VerifyEmailCard
        title={t('verify.invalidTitle')}
        description={t('verify.invalidDescription')}
        body={t('verify.invalidBody')}
        buttonText={t('verify.goToSignIn')}
        buttonHref="/sign-in"
        buttonVariant="outline"
      />
    )
  }

  if (outcome === 'changed') {
    return (
      <VerifyEmailCard
        title={t('verify.changedTitle')}
        description={t('verify.changedDescription')}
        body={t('verify.changedBody')}
        buttonText={t('verify.goToSignIn')}
        buttonHref="/sign-in"
      />
    )
  }

  return (
    <VerifyEmailCard
      title={t('verify.confirmedTitle')}
      description={t('verify.confirmedDescription')}
      body={t('verify.confirmedBody')}
      buttonText={t('verify.goToSignIn')}
      buttonHref="/sign-in"
    />
  )
}
