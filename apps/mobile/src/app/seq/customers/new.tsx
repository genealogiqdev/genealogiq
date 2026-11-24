import { Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { seqApi, type CustomerNewView } from '@/api/seq'
import { CUSTOMER_DEFAULTS, customerInput, useCustomerSpecs } from '@/features/seq/customer'
import { FormFields, useForm, type Spec } from '@/features/seq/forms'
import { text, uuid } from '@/features/seq/util'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, Card, Field, Heading, Icon, Muted, QueryView, Row, Screen, Text } from '@/ui'

const STEPS = ['personal', 'contact', 'address', 'access'] as const

function Choice({ selected, title, description, onPress }: { selected: boolean; title: string; description: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className={`min-h-12 flex-row items-start gap-3 rounded-xl border p-4 ${selected ? 'border-accent bg-default' : 'border-border bg-surface'}`}
    >
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} />
      <View className="flex-1">
        <Text className="font-medium">{title}</Text>
        <Muted>{description}</Muted>
      </View>
    </Pressable>
  )
}

function Wizard({ view }: { view: CustomerNewView }) {
  const t = useT('Customers')
  const tc = useT('Common')
  const ta = useT('PremiumAccess')
  const router = useRouter()
  const invalidate = useInvalidate('seq')
  const form = useForm(CUSTOMER_DEFAULTS)
  const specs = useCustomerSpecs(view.categories)
  const [step, setStep] = useState(0)
  const [premium, setPremium] = useState(false)
  const [genCode, setGenCode] = useState('')
  // One id per form instance: a retry of the same submission records the sale once.
  const [requestId] = useState(uuid)
  const canPremium = view.canManageAccess && view.canUseGenCodePremium

  const stepSpecs: Spec[][] = [specs.personal, specs.contact, specs.address, []]
  const key = STEPS[step]

  function next() {
    if (form.validate(stepSpecs[step])) setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  async function submit() {
    // Re-validate everything: an earlier step may hold a server-side field error.
    for (let index = 0; index < 3; index += 1) {
      if (!form.validate(stepSpecs[index])) {
        setStep(index)
        return
      }
    }
    const code = genCode.trim().toUpperCase()
    await form.submit(
      () =>
        seqApi.createCustomer(
          customerInput(form.values),
          premium && canPremium ? { mode: 'gencode-premium', requestId, ...(code ? { genCode: code } : {}) } : { mode: 'registration' },
        ),
      {
        success: true,
        onSuccess: async () => {
          await invalidate(['customers'], ['activations'], ['dashboard'])
          router.back()
        },
      },
    )
  }

  // A server-reported field error may belong to a step that is not on screen.
  useEffect(() => {
    const failing = stepSpecs.findIndex((list) => list.some((spec) => form.errors[spec.key]))
    if (failing >= 0 && failing !== step) setStep(failing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.errors])

  return (
    <Screen
      footer={
        <Row>
          {step > 0 ? (
            <View className="flex-1">
              <Button label={tc('back')} variant="secondary" onPress={() => setStep((current) => current - 1)} disabled={form.pending} fullWidth />
            </View>
          ) : null}
          <View className="flex-1">
            {step < STEPS.length - 1 ? (
              <Button label={tc('next')} onPress={next} fullWidth />
            ) : (
              <Button label={form.pending ? tc('creating') : t('createCustomer')} onPress={() => void submit()} loading={form.pending} fullWidth />
            )}
          </View>
        </Row>
      }
    >
      <View accessibilityLabel={t('stepsLabel')}>
        <Muted>{t('stepOf', { step: step + 1, total: STEPS.length })}</Muted>
        <Heading>{t(`steps.${key}.title`)}</Heading>
        <Muted>{t(`steps.${key}.desc`)}</Muted>
        <Row className="mt-2 gap-1">
          {STEPS.map((name, index) => (
            <View key={name} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-accent' : 'bg-default'}`} />
          ))}
        </Row>
      </View>

      {step === 2 ? <Muted>{t('hints.addressOptional')}</Muted> : null}
      {step < 3 ? <FormFields specs={stepSpecs[step]} form={form} /> : null}

      {step === 3 ? (
        <View className="gap-4">
          <Card>
            <Heading>{ta('invitationTitle')}</Heading>
            <Muted>{ta('invitationDescription', { email: text(form.values, 'email') })}</Muted>
          </Card>
          <Heading>{ta('onboardingTitle')}</Heading>
          <View accessibilityRole="radiogroup" className="gap-3">
            <Choice selected={!premium} title={ta('registrationOnly')} description={ta('registrationDescription')} onPress={() => setPremium(false)} />
            {canPremium ? (
              <Choice selected={premium} title={ta('saleAndPremium')} description={ta('saleDescription')} onPress={() => setPremium(true)} />
            ) : (
              <Muted>{ta('adminRequired')}</Muted>
            )}
          </View>
          {premium && canPremium ? (
            <Field
              label={ta('codeOptional')}
              value={genCode}
              onChangeText={(value) => setGenCode(value.toUpperCase())}
              maxLength={64}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              hint={ta('codeOptionalHelp')}
              autoCapitalize="characters"
              autoCorrect={false}
              disabled={form.pending}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  )
}

export default function SeqCustomerNew() {
  const t = useT('Customers')
  const query = useView('seq', ['customerNew'], () => seqApi.customerNew())
  return (
    <>
      <Stack.Screen options={{ title: t('new') }} />
      <QueryView query={query}>{(view) => <Wizard view={view} />}</QueryView>
    </>
  )
}
