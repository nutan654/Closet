import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { StoreProvider } from "@/lib/StoreContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Closet ♡",
  description: "A tiny home for your outfits, mood, and everyday you.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <StoreProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AppShell>{children}</AppShell>
              </ConfirmProvider>
            </ToastProvider>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
