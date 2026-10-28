import { ForgotPasswordForm } from './forgot-password-form'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const { expired } = await searchParams
  return <ForgotPasswordForm linkExpired={expired === '1'} />
}
