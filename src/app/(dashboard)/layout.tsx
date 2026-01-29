import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from 'sonner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" />
    </QueryProvider>
  )
}
