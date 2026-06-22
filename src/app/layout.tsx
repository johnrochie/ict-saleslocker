import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ICT SalesIQ',
  description: 'ICT Services — Sales Operations Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
