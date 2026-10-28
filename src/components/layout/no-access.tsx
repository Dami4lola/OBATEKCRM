'use client'

import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function NoAccess({ email }: { email: string | null }) {
  const router = useRouter()

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
          <CardTitle className="text-2xl font-bold">No access yet</CardTitle>
          <CardDescription>
            {email ? <strong>{email}</strong> : 'This account'} isn&apos;t on the
            OBATEK team. Ask the account owner to add you.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
