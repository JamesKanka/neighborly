import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Neighborly",
  description: "Neighborhood item sharing with validated handoffs"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <main className="app-shell">
            <Nav />
            <section className="content">{children}</section>
          </main>
        </Providers>
      </body>
    </html>
  );
}
