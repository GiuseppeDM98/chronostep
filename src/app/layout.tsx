import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Chronostep",
  description: "Personal task tracker focused on steps and work logs.",
  icons: {
    icon: "/favicon.svg",
  },
};

// Root layout keeps global styles and wraps providers for all routes.
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="bg-slate-50 text-slate-900 antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
