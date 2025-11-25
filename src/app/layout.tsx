import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Chronostep",
  description: "Personal task tracker focused on steps and work logs.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
  </html>
);

export default RootLayout;
