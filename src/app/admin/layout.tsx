'use client'

import { AdminNavbar } from './components/AdminNavbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Authorization logic has been temporarily removed for development.
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
       <AdminNavbar />
       <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
