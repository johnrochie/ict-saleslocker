import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        userEmail={user.email ?? ''}
        userName={profile?.full_name ?? user.email ?? ''}
        userRole={profile?.role ?? 'read_only'}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
