import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '../lib/cart'

export const metadata: Metadata = {
  title: 'Vendora',
  description: 'Vendora marketplace runtime workspace',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  )
}
