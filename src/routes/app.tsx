import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Dashboard — Video Speed Reader" }] }),
  component: AppShell,
});

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/signin" });
  }, [loading, user, navigate]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center bg-hero text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
            <span className="font-semibold tracking-tight">Video Speed Reader</span>
          </Link>
          <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>
      <main className="container mx-auto px-6 py-20">
        <div className="animate-fade-up mx-auto max-w-2xl rounded-2xl border border-border bg-card/60 p-10 backdrop-blur">
          <h1 className="text-3xl font-bold tracking-tight">
            Hi <span className="text-gradient">{user.email}</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Your dashboard is coming soon. Upload functionality will be added in the next milestone.
          </p>
        </div>
      </main>
    </div>
  );
}
