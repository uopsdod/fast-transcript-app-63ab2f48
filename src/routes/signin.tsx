import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in — Video Speed Reader" }] }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/app" });
  };

  return <AuthShell title="Sign in" subtitle="登入你的帳號">
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={loading} className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        No account? <Link to="/signup" className="text-primary hover:underline">Sign up</Link>
      </p>
    </form>
  </AuthShell>;
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hero">
      <header className="container mx-auto px-6 py-6">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="font-semibold tracking-tight">Video Speed Reader</span>
        </Link>
      </header>
      <main className="container mx-auto flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 backdrop-blur">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
