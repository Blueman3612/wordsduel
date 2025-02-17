'use client'

import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/context/auth";
import { ToastProvider } from "@/lib/context/toast";

const inter = Inter({ subsets: ["latin"] });

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
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
