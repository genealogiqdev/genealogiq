import { verifySession } from '@/lib/dal'
import { SidebarProvider, SidebarTrigger } from '@genealogiq/ui/sidebar'
import { SessionProvider } from '@/components/providers/session-provider'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { AppBreadcrumb } from '@/components/breadcrumb/breadcrumb'
import { ModeToggle } from '@/components/theme/mode-toggle'
import { LanguageSwitcher } from '@/components/language-switcher'
import { UserMenu } from '@/components/users/user-menu'

export default async function ProtectPagesLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await verifySession()

  return (
    <SessionProvider>
    <SidebarProvider
      style={
        {
          "--sidebar-width": "14rem",
          "--sidebar-width-mobile": "14rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-col w-full min-h-screen">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <AppBreadcrumb />
          </div>
          <div className="flex gap-4 items-center">
            <LanguageSwitcher />
            <ModeToggle />
            <UserMenu
              name={session?.user?.name}
              email={session?.user?.email}
              image={session?.user?.image}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </SidebarProvider>
    </SessionProvider>
  )
}
