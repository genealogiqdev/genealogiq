import { Resend } from "resend"

// Canonical transactional emails for all three apps. One transport, one set of
// English templates; the only per-app variation is the link base URL (and the
// product name on the welcome email). Each app's lib/email.ts is a thin adapter
// that injects its own *_URL.

const FROM = "no-reply@genealogiq.com.br"

let client: Resend | undefined
function resend(): Resend {
  // Lazy: importing this module never requires RESEND_API_KEY; only sending does.
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

async function send(to: string, subject: string, html: string, idempotencyKey?: string): Promise<void> {
  const message = { from: FROM, to, subject, html }
  const result = idempotencyKey
    ? await resend().emails.send(message, { idempotencyKey })
    : await resend().emails.send(message)
  if (result.error || !result.data?.id) throw new Error('Email delivery was rejected by the provider')
}

/** Plain text only: callers cannot inject HTML, credentials or template markup. */
export interface NotificationEmail {
  subject: string
  name: string
  paragraphs: string[]
  details?: { label: string; value: string }[]
  action: { label: string; url: string }
}

export function sendNotificationEmail(to: string, message: NotificationEmail, idempotencyKey: string): Promise<void> {
  const url = new URL(message.action.url)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid notification URL')
  return send(to, message.subject, `
    <p>Olá ${escapeHtml(message.name)},</p>
    ${message.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
    ${message.details?.length ? `<dl>${message.details.map(({ label, value }) => `<dt>${escapeHtml(label)}</dt><dd><strong>${escapeHtml(value)}</strong></dd>`).join('\n')}</dl>` : ''}
    <p><a href="${escapeHtml(url.toString())}">${escapeHtml(message.action.label)}</a></p>
    <p>Equipe Genealogiq</p>
  `, idempotencyKey)
}

export function sendPartnerCredentialsEmail({ to, password, baseUrl, initialGenCodes }: {
  to: string
  password: string
  baseUrl: string
  initialGenCodes: number
}): Promise<void> {
  const url = `${baseUrl}/sign-in`
  return send(to, 'Seu acesso ao Sequoia está disponível', `
    <p>Seu acesso ao Sequoia já está liberado.</p>
    <p>E-mail de acesso: <strong>${escapeHtml(to)}</strong></p>
    <p>Senha inicial: <strong>${escapeHtml(password)}</strong></p>
    <p><a href="${escapeHtml(url)}">Entrar no Sequoia</a></p>
    <p>GenCodes iniciais disponíveis: <strong>${initialGenCodes}</strong>.</p>
    <p>Cada GenCode permite ativar um perfil. Os créditos têm validade de 12 meses.</p>
    <p>Recomendamos alterar sua senha nas configurações da conta após entrar.</p>
  `)
}

export interface ConsumerPremiumEmail {
  to: string
  name: string
  expiresAt: Date
  baseUrl: string
  password?: string
  token?: string
}

export function sendConsumerPremiumEmail({ to, name, expiresAt, baseUrl, password, token }: ConsumerPremiumEmail): Promise<void> {
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(expiresAt)
  const signIn = escapeHtml(`${baseUrl}/sign-in`)
  const recovery = escapeHtml(token ? `${baseUrl}/reset-password?token=${encodeURIComponent(token)}` : `${baseUrl}/forgot-password`)
  return send(to, 'Seu acesso Premium à Genealogiq está liberado', `
    <p>Olá ${escapeHtml(name)},</p>
    <p>A Genealogiq presenteou você com <strong>12 meses de acesso Premium</strong> para preservar as histórias da sua família.</p>
    <p>Seu Premium está disponível até <strong>${escapeHtml(date)}</strong>, sem cobrança ou renovação automática.</p>
    <p>E-mail de acesso: <strong>${escapeHtml(to)}</strong></p>
    ${password ? `<p>Senha inicial: <strong>${escapeHtml(password)}</strong></p>
    <p>Você já pode entrar. Recomendamos alterar a senha nas configurações após o primeiro acesso.</p>`
    : `<p>Se você já tem conta, use sua senha atual ou entre com o Google.</p>`}
    <p><a href="${signIn}">Entrar na Genealogiq</a></p>
    ${!password ? `<p><a href="${recovery}">${token ? 'Definir uma nova senha (link válido por 72h)' : 'Esqueci minha senha'}</a></p>` : ''}
    <p>Equipe Genealogiq</p>
  `)
}

export interface TokenEmail {
  to: string
  token: string
  baseUrl: string
}

export function sendVerificationEmail({ to, token, baseUrl }: TokenEmail): Promise<void> {
  const url = `${baseUrl}/verify-email?token=${token}`
  return send(to, "Confirm your email", `
    <p>Thank you for creating your account.</p>
    <p>Click the link below to confirm your email (expires in 24h):</p>
    <p><a href="${url}">Confirm email</a></p>
    <p>If you did not create this account, ignore this email.</p>
  `)
}

export function sendEmailChangeEmail({ to, token, baseUrl }: TokenEmail): Promise<void> {
  const url = `${baseUrl}/verify-email?token=${token}`
  return send(to, "Confirm your new email", `
    <p>We received a request to change the email address on your account.</p>
    <p>Click the link below to confirm the new address (expires in 1h):</p>
    <p><a href="${url}">Confirm new email</a></p>
    <p>If you did not request this, ignore this email.</p>
  `)
}

export function sendPasswordResetEmail({ to, token, baseUrl }: TokenEmail): Promise<void> {
  const url = `${baseUrl}/reset-password?token=${token}`
  return send(to, "Password reset", `
    <p>We received a request to reset your password.</p>
    <p>Click the link below to create a new password (expires in 1h):</p>
    <p><a href="${url}">Reset password</a></p>
    <p>If you did not request this, please ignore this email.</p>
  `)
}

export function sendAccountDeletionEmail({ to }: { to: string }): Promise<void> {
  return send(to, "Your account has been deleted", `
    <p>Your account has been successfully deleted.</p>
    <p>We'll miss you. If you ever want to return, we'll be here.</p>
    <p>If you did not request account deletion, contact us immediately.</p>
  `)
}

export interface FeedbackEmail {
  to: string
  type: "bug" | "feedback" | "contact" | "career"
  message: string
  // Legacy field (BMS/SEQ): the sender's email, derived server-side from their
  // session. APP's dialog collects it as an explicit form field instead — use
  // `email` there; `contactEmail` stays for backward compatibility.
  contactEmail?: string
  email?: string
  cvUrl?: string
  page?: string
}

// User-supplied strings (message/email/page) end up as raw HTML in the notification
// email — escape them so a submitted "<img src=x onerror=...>" can't execute in
// whatever mail client renders it.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const FEEDBACK_SUBJECTS: Record<FeedbackEmail["type"], string> = {
  bug: "Genealogiq — Bug report",
  feedback: "Genealogiq — Feedback",
  contact: "Genealogiq — Contact",
  career: "Genealogiq — Career application",
}

const FEEDBACK_TYPE_LABELS: Record<FeedbackEmail["type"], string> = {
  bug: "Bug report",
  feedback: "Feedback",
  contact: "Contact",
  career: "Career application",
}

export function sendFeedbackEmail({ to, type, message, contactEmail, email, cvUrl, page }: FeedbackEmail): Promise<void> {
  const replyTo = email ?? contactEmail
  return send(to, FEEDBACK_SUBJECTS[type], `
    <p><strong>Type:</strong> ${FEEDBACK_TYPE_LABELS[type]}</p>
    ${page ? `<p><strong>Page:</strong> ${escapeHtml(page)}</p>` : ""}
    ${replyTo ? `<p><strong>Reply to:</strong> ${escapeHtml(replyTo)}</p>` : ""}
    ${cvUrl ? `<p><strong>CV:</strong> <a href="${escapeHtml(cvUrl)}">Download</a></p>` : ""}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
  `)
}

export function sendWelcomeEmail({
  to,
  token,
  baseUrl,
  productName,
}: TokenEmail & { productName?: string }): Promise<void> {
  const url = `${baseUrl}/reset-password?token=${token}`
  const subject = productName ? `Welcome to ${productName}! Set up your access` : "Welcome! Set up your access"
  return send(to, subject, `
    <p>Your account was created by an administrator.</p>
    <p>Click the link below to set your password and access the system (expires in 72h):</p>
    <p><a href="${url}">Set up password</a></p>
    <p>If you were not expecting this email, please contact your administrator.</p>
  `)
}

// Shared Genealogiq consumer email body. Both the welcome (tenant-created access,
// link sets the password) and the self-sign-up verification (user already chose a
// password, link confirms the email) use the exact same brand copy — only the
// call-to-action block (intro line + button label) and the link differ.
function appConsumerBody(opts: {
  greeting: string
  ctaIntro: string
  url: string
  ctaLabel: string
}): string {
  return `
    <p>${opts.greeting}</p>
    <p>Seja bem-vindo à Genealogiq.</p>
    <p>A partir de agora, você não é apenas um usuário. Você se tornou um <strong>guardião de histórias</strong> que merecem continuar vivas.</p>
    <p>A maioria das memórias se perde com o tempo. Aqui, você muda esse destino.</p>
    <p>A Genealogiq foi criada para que famílias possam preservar, organizar e eternizar aquilo que realmente importa: a história de quem veio antes de nós. E agora, isso está nas suas mãos.</p>
    <p><strong>Para começar agora, siga esses passos simples:</strong></p>
    <p>${opts.ctaIntro}</p>
    <p><a href="${opts.url}">${opts.ctaLabel}</a></p>
    <p>Depois:</p>
    <ul>
      <li>Complete os seus dados de perfil.</li>
      <li>Crie o primeiro perfil de alguém especial.</li>
      <li>Adicione fotos ou memórias marcantes.</li>
      <li>Conecte essa pessoa à sua árvore familiar.</li>
    </ul>
    <p>Tudo isso leva menos de 2 minutos. Mas o impacto atravessa gerações.</p>
    <p>Se precisar de ajuda, estamos aqui.<br/>Bem-vindo ao início de algo maior que você.</p>
    <p>Equipe Genealogiq®️<br/><em>"As pessoas só morrem quando são esquecidas".</em></p>
  `
}

// Welcome email for an APP consumer (memorial guardian) — distinct copy/tone from
// the staff welcome above. Sent when a tenant registers/sells access to a
// consumer; the link sets their password.
export function sendAppConsumerWelcomeEmail({
  to,
  token,
  baseUrl,
  name,
  callbackUrl,
}: TokenEmail & { name?: string; callbackUrl?: string }): Promise<void> {
  // callbackUrl deep-links the consumer back to a destination (e.g. the physical
  // QR code /qr/<code>) after they create their password and sign in. Only the
  // physical-QR platform sale passes it; digital sales omit it.
  const cb = callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""
  const url = `${baseUrl}/reset-password?token=${token}${cb}`
  const greeting = name ? `Olá ${name},` : "Olá,"
  return send(to, "Bem-vindo à Genealogiq — crie o seu acesso", appConsumerBody({
    greeting,
    ctaIntro: "Clique no link abaixo para criar a sua senha (expira em 72h):",
    url,
    ctaLabel: "Criar minha senha",
  }))
}

// Verification email for an APP consumer who signed up themselves. Same brand copy
// as the welcome above, but the account already has a password — the link only
// confirms the email (24h). callbackUrl threads the post-verification destination.
export function sendAppConsumerVerificationEmail({
  to,
  token,
  baseUrl,
  name,
  callbackUrl,
}: TokenEmail & { name?: string; callbackUrl?: string }): Promise<void> {
  const cb = callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""
  // Points at the API route (not the /verify-email page directly) so clicking
  // it auto-logs the user in — see apps/app/src/app/api/verify-email/route.ts.
  // sendEmailChangeEmail below is unrelated and keeps linking straight to the
  // page; do not repoint it, it's shared by BMS/SEQ which have no such route.
  const url = `${baseUrl}/api/verify-email?token=${token}${cb}`
  const greeting = name ? `Olá ${name},` : "Olá,"
  return send(to, "Bem-vindo à Genealogiq — confirme o seu e-mail", appConsumerBody({
    greeting,
    ctaIntro: "Clique no link abaixo para confirmar o seu e-mail (expira em 24h):",
    url,
    ctaLabel: "Confirmar meu e-mail",
  }))
}

// Delivers a GenCode to a buyer who ALREADY has a password — the welcome
// email above can't be reused for them, since its link sets a password. Here
// the code itself is the payload and the link goes straight to the activation
// page. Sent by SEQ when a tenant sells a code to an existing consumer.
export function sendGenCodeDeliveryEmail({
  to,
  baseUrl,
  genCode,
  name,
}: { to: string; baseUrl: string; genCode: string; name?: string }): Promise<void> {
  const greeting = name ? `Olá ${name},` : "Olá,"
  return send(to, "Genealogiq — o seu código de ativação", `
    <p>${greeting}</p>
    <p>Você recebeu um código Genealogiq para criar o memorial de alguém especial.</p>
    <p><strong>Seu código:</strong> ${genCode}</p>
    <p>Clique abaixo para ativá-lo — é só entrar na sua conta e preencher os dados da pessoa homenageada:</p>
    <p><a href="${baseUrl}/qr/${genCode}">Ativar meu código</a></p>
    <p>Se preferir, entre na sua conta e informe o código manualmente.</p>
    <p>Equipe Genealogiq®️<br/><em>"As pessoas só morrem quando são esquecidas".</em></p>
  `)
}

// Notice sent instead of a verification link when someone attempts to sign up
// with an email that already has an account. The sign-up action redirects to
// /verify-email either way (new account or existing one) so the response can't
// be used to enumerate registered emails — only the actual account owner finds
// out, via this email.
export function sendAppAccountExistsEmail({
  to,
  baseUrl,
  name,
}: { to: string; baseUrl: string; name?: string }): Promise<void> {
  const greeting = name ? `Olá ${name},` : "Olá,"
  return send(to, "Genealogiq — Você já tem uma conta", `
    <p>${greeting}</p>
    <p>Alguém tentou criar uma nova conta na Genealogiq usando este endereço de e-mail, mas você já possui uma conta com a gente.</p>
    <p>Se foi você, é só entrar normalmente:</p>
    <p><a href="${baseUrl}/sign-in">Entrar na minha conta</a></p>
    <p>Esqueceu sua senha? <a href="${baseUrl}/forgot-password">Redefina aqui</a>.</p>
    <p>Se não foi você, pode ignorar este e-mail com segurança.</p>
    <p>Equipe Genealogiq</p>
  `)
}

// Welcome email for a Sequoia (SEQ) tenant staff member — distinct copy/tone from
// the generic staff welcome. Sent when an admin creates the staff account; the
// link sets their password.
export function sendSequoiaWelcomeEmail({
  to,
  token,
  baseUrl,
  name,
}: TokenEmail & { name?: string }): Promise<void> {
  const url = `${baseUrl}/reset-password?token=${token}`
  const greeting = name ? `Olá ${name},` : "Olá,"
  return send(to, "Bem-vindo à plataforma Sequoia — crie o seu acesso", `
    <p>${greeting}</p>
    <p>Seja bem-vindo à plataforma Sequoia.</p>
    <p>A partir de agora, sua empresa não oferece apenas serviços funerários. Você passa a entregar <strong>continuidade, memória e legado</strong> às famílias que atende.</p>
    <p>A Sequoia foi criada para transformar a forma como funerárias e cemitérios se conectam com seus clientes, trazendo tecnologia, organização e significado para um dos momentos mais delicados da vida.</p>
    <p>Você agora tem acesso a uma plataforma completa para:</p>
    <ul>
      <li>Gerenciar famílias e atendimentos;</li>
      <li>Adquirir novos Gen-codes e acumular pontos de Legado;</li>
      <li>Integrar o uso do Gen-Code no seu processo;</li>
      <li>Elevar o valor percebido dos seus serviços;</li>
      <li>Ver seu Ranking no Programa Guardiões do Legado.</li>
    </ul>
    <p><strong>Para começar agora:</strong></p>
    <p>Clique no link abaixo para criar a sua senha e acessar a plataforma (expira em 72h):</p>
    <p><a href="${url}">Criar minha senha</a></p>
    <p>Depois:</p>
    <ul>
      <li>Cadastre seu primeiro cliente;</li>
      <li>Gere o primeiro memorial digital.</li>
    </ul>
    <p>Simples, rápido e poderoso.</p>
    <p>Nos próximos dias, você receberá orientações práticas para implementar isso no seu atendimento com naturalidade e respeito.</p>
    <p>Você não está vendendo um produto. Você está entregando algo que permanece.</p>
    <p>Conte conosco nessa jornada.</p>
    <p>Equipe Sequoia | Genealogiq<br/><em>"Transformando o luto em legado"</em></p>
  `)
}

// The Stripe payment link for a B2B sale a GenealogiQ operator opened in BMS.
// Everything here is a value the operator or Stripe produced, not free text from
// a form — but tenantName and productName come from rows an admin typed, so they
// are escaped like any other interpolated string.
//
// The amount arrives already formatted: only the caller knows the currency and
// the viewer's locale, and a discount means the number is Stripe's, not
// quantity × price.
export function sendSalePaymentLinkEmail({
  to,
  url,
  tenantName,
  productName,
  quantity,
  amount,
  expiresAt,
}: {
  to:          string
  url:         string
  tenantName:  string
  productName: string
  quantity:    number
  amount:      string
  expiresAt:   Date
}): Promise<void> {
  const deadline = expiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
  const units    = quantity === 1 ? "1 unidade" : `${quantity} unidades`

  return send(to, "Genealogiq — link para pagamento do seu pedido", `
    <p>Olá ${escapeHtml(tenantName)},</p>
    <p>Seu pedido está pronto para pagamento:</p>
    <p>
      <strong>${escapeHtml(productName)}</strong> — ${units}<br/>
      <strong>Total: ${escapeHtml(amount)}</strong>
    </p>
    <p><a href="${url}">Pagar agora</a></p>
    <p>O link é válido até <strong>${deadline}</strong>. Depois disso ele deixa de funcionar e nós geramos um novo para você.</p>
    <p>Assim que o pagamento for confirmado, seus GenCodes ficam disponíveis no Sequoia e você recebe as instruções de acesso.</p>
    <p>Equipe Genealogiq®️<br/><em>"As pessoas só morrem quando são esquecidas".</em></p>
  `)
}

// ─── Renewal & trial notifications ───────────────────────────────────────────
//
// The eight moments in the founder's spec §13, plus the B2C trial ending.
//
// Every one of these has the same trap in it, and it is worth stating once:
// a partner reading "your allowance expires" will assume the families they
// already served are at risk. They are not. Whatever else changes in this copy,
// the sentence saying activated memorials stay online must survive.

function renewalShell(body: string): string {
  return `${body}
    <p style="color:#666;font-size:13px">
      Memoriais já ativados continuam no ar normalmente — nada do que suas famílias
      receberam depende da renovação.
    </p>
    <p>Equipe Genealogiq®️<br/><em>"As pessoas só morrem quando são esquecidas".</em></p>`
}

const ptDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })

export interface RenewalNoticeEmail {
  to:          string
  partnerName: string
  planName:    string
  /** Unused activations that would be lost if nothing changes. */
  unused:      number
  /** What would carry over if they renewed today. */
  rollover:    number
  endAt:       Date
  graceEndAt:  Date
  url:         string
}

/**
 * D-90 / D-60 / D-30 / D-7 — before the cycle ends.
 *
 * The rollover figure is the whole point of sending these early. A partner with
 * 70 unused activations and a 30-credit cap is about to lose 40, and the only
 * moment that fact is actionable is while they can still sell them.
 */
export function sendRenewalReminderEmail({
  to, partnerName, planName, unused, rollover, endAt, url,
}: RenewalNoticeEmail & { daysOut: number }): Promise<void> {
  const losing = Math.max(0, unused - rollover)

  return send(to, `Genealogiq — sua assinatura ${planName} vence em ${ptDate(endAt)}`, renewalShell(`
    <p>Olá ${escapeHtml(partnerName)},</p>
    <p>Seu ciclo do plano <strong>${escapeHtml(planName)}</strong> termina em <strong>${ptDate(endAt)}</strong>.</p>
    <p>
      Você ainda tem <strong>${unused} ativação(ões)</strong> disponíveis.
      ${rollover > 0
        ? `Renovando até o vencimento, <strong>${rollover}</strong> delas são transferidas para o próximo ciclo.`
        : `Nenhuma delas é transferida automaticamente.`}
      ${losing > 0 ? `<br/><strong>${losing}</strong> não serão transferidas — ainda dá tempo de usá-las.` : ""}
    </p>
    <p><a href="${url}">Renovar agora</a></p>
  `))
}

/** D0 — the cycle ended. Balance frozen, still visible, grace running. */
export function sendPastDueEmail({
  to, partnerName, planName, unused, graceEndAt, url,
}: RenewalNoticeEmail): Promise<void> {
  return send(to, `Genealogiq — o ciclo do plano ${planName} venceu`, renewalShell(`
    <p>Olá ${escapeHtml(partnerName)},</p>
    <p>O ciclo do seu plano <strong>${escapeHtml(planName)}</strong> venceu e novas ativações estão pausadas.</p>
    <p>
      Suas <strong>${unused} ativação(ões)</strong> continuam registradas e visíveis.
      Você tem até <strong>${ptDate(graceEndAt)}</strong> para renovar e preservá-las.
    </p>
    <p><a href="${url}">Regularizar</a></p>
  `))
}

/** D+15 / D+30 — grace is running out. */
export function sendGraceReminderEmail({
  to, partnerName, planName, unused, rollover, graceEndAt, url,
}: RenewalNoticeEmail & { lastCall: boolean }): Promise<void> {
  return send(
    to,
    `Genealogiq — ${"últimos dias"} para preservar suas ativações`,
    renewalShell(`
      <p>Olá ${escapeHtml(partnerName)},</p>
      <p>
        Você tem até <strong>${ptDate(graceEndAt)}</strong> para renovar o plano
        <strong>${escapeHtml(planName)}</strong> e manter <strong>${rollover}</strong> das suas
        ${unused} ativações restantes.
      </p>
      <p>Depois dessa data, renovar cria um contrato novo e o saldo anterior não é recuperado.</p>
      <p><a href="${url}">Renovar</a></p>
    `),
  )
}

/** D+31 — grace is over. Said plainly, because the alternative is a surprise later. */
export function sendCycleExpiredEmail({
  to, partnerName, planName, url,
}: Omit<RenewalNoticeEmail, "unused" | "rollover" | "endAt" | "graceEndAt">): Promise<void> {
  return send(to, `Genealogiq — o plano ${planName} expirou`, renewalShell(`
    <p>Olá ${escapeHtml(partnerName)},</p>
    <p>O prazo para renovar o plano <strong>${escapeHtml(planName)}</strong> terminou, e as ativações que não foram usadas expiraram.</p>
    <p>Você pode contratar um plano novo quando quiser — ele começa com a franquia cheia.</p>
    <p><a href="${url}">Ver planos</a></p>
  `))
}

/**
 * D-30 of a B2C trial ending.
 *
 * This one carries more weight than it looks. The trial is granted to the
 * guardian, so they never hit a quota wall during the twelve months — nothing
 * in the product ever asks them to subscribe. This email IS the conversion
 * moment, not a reminder of one.
 */
export function sendTrialEndingEmail({
  to, name, planName, endsAt, url,
}: {
  to:       string
  name:     string
  planName: string
  endsAt:   Date
  url:      string
}): Promise<void> {
  return send(to, "Genealogiq — seu acesso completo termina em 30 dias", `
    <p>Olá ${escapeHtml(name)},</p>
    <p>
      Seu acesso ao <strong>${escapeHtml(planName)}</strong>, que veio junto com a placa,
      termina em <strong>${ptDate(endsAt)}</strong>.
    </p>
    <p>
      Nada será apagado. O memorial continua no ar e tudo o que você já criou permanece
      visível — o que muda são os limites para adicionar coisas novas.
    </p>
    <p><a href="${url}">Continuar com o plano completo</a></p>
    <p>Equipe Genealogiq®️<br/><em>"As pessoas só morrem quando são esquecidas".</em></p>
  `)
}
