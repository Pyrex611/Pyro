import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { StatusBanner } from "@/components/status-banner";

export const metadata: Metadata = {
  title: "Pyro — PyrexxAI Healthcare Lead Engine",
  description: "High-intent healthcare lead sourcing, deduplication, and scoring platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <div className="flex h-screen w-screen overflow-hidden">
          {/* Static, Non-Scrolling Navigation Sidebar */}
          <Sidebar />

          {/* Viewport Content Column */}
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            <StatusBanner />
            {/* The ONLY container that scrolls vertically */}
            <main className="flex-1 overflow-y-auto p-8 max-w-7xl w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}