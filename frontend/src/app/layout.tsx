import { AppToaster } from "@/components/error/app-toaster";
import { QueryProvider } from "@/providers/query-provider";
import { AppDialogProvider } from "@/providers/app-dialog-provider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise AI Workspace",
  description: "Manage AI agents across your enterprise",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <QueryProvider>
          <AppDialogProvider>
            {children}
            <AppToaster />
          </AppDialogProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
