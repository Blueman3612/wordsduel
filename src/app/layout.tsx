'use client'

import { Inter } from "next/font/google";
import { AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import "./globals.css";
import { AuthProvider } from "@/lib/context/auth";
import { ToastProvider } from "@/lib/context/toast";
import { Background } from "@/components/layout/Background"

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ToastProvider>
            {/* Static background */}
            <Background />
            
            {/* Animated content */}
            <div className="relative min-h-screen overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <main key={pathname} className="relative">
                  {children}
                </main>
              </AnimatePresence>
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
