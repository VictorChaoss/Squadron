import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/SolanaWalletProvider";

export const metadata: Metadata = {
  title: "Squadron | Collaborative Pump.fun Token Launches",
  description: "Collaborative pump.fun launches with automated creator fee routing to squad members.",
  icons: {
    icon: "/branding/logo-square.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen text-slate-100 font-sans selection:bg-[#ccff00] selection:text-black">
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </body>
    </html>
  );
}
