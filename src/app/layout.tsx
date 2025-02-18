import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/context/auth";
import { ToastProvider } from "@/lib/context/toast";
import { Background } from "@/components/layout/Background"
import { NavigationProvider } from '@/lib/context/navigation'
import { AnimatedLayout } from '@/components/layout/AnimatedLayout'
import { VisibilityHandler } from '@/components/layout/VisibilityHandler'

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'Logobout',
  description: 'A battle of words and wit',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ToastProvider>
            <NavigationProvider>
              <Background />
              <VisibilityHandler>
                <AnimatedLayout>
                  {children}
                </AnimatedLayout>
              </VisibilityHandler>
            </NavigationProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
