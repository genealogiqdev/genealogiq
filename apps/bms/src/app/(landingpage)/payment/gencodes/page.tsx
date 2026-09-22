import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@genealogiq/ui/card'

export default async function GenCodePaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const [{ status }, t] = await Promise.all([
    searchParams,
    getTranslations('GenCodePackages.payment'),
  ])
  const successful = status === 'success'

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{successful ? t('successTitle') : t('cancelTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground">
          <p>{successful ? t('successDescription') : t('cancelDescription')}</p>
          <p>{t('close')}</p>
        </CardContent>
      </Card>
    </div>
  )
}

