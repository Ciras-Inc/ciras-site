import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
