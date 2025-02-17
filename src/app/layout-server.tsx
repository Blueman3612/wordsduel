import type { Metadata } from "next";
import RootLayout from "./layout";

export const metadata: Metadata = {
  title: "WordsDuel - Real-time Word Game",
  description: "A multiplayer word game where players compete by matching word parameters",
};

export default function ServerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RootLayout>{children}</RootLayout>;
} 