import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import SiteHeader from "@/components/SiteHeader";
import AuthSessionProvider from "@/components/AuthSessionProvider";

export const metadata: Metadata = {
  title: "Wholesale Buyer Portal",
  description: "B2B FMCG distribution — order by the carton.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>
          <CartProvider>
            <SiteHeader />
            <main>{children}</main>
          </CartProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
