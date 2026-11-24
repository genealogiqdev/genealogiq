import { consumeEmailToken } from '@/lib/verify-email'
import { VerifyEmailCard } from '@/components/auth/verify-email-card'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return (
      <VerifyEmailCard
        title="Verify your email"
        description="Confirmation email sent."
        body="Click the link we sent to confirm your account. The link expires in 1 hour."
        buttonText="Go to sign in"
        buttonHref="/sign-in"
        buttonVariant="outline"
      />
    )
  }

  const outcome = await consumeEmailToken(token)

  if (outcome === 'invalid') {
    return (
      <VerifyEmailCard
        title="Invalid or expired link"
        description="This verification link is not valid or has already expired."
        body="Request a new link from your profile page."
        buttonText="Go to sign in"
        buttonHref="/sign-in"
        buttonVariant="outline"
      />
    )
  }

  if (outcome === 'changed') {
    return (
      <VerifyEmailCard
        title="Email changed!"
        description="Your email has been updated successfully."
        body="Sign in again with your new email address."
        buttonText="Sign in"
        buttonHref="/sign-in"
      />
    )
  }

  return (
    <VerifyEmailCard
      title="Email confirmed!"
      description="Your account has been verified successfully."
      body="You can now sign in with your email and password."
      buttonText="Sign in"
      buttonHref="/sign-in"
    />
  )
}
