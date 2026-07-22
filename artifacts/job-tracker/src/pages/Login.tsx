import { useState } from "react";
import { Briefcase, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useLogin,
  useRegister,
  useGoogleAuth,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const BULLETS = [
  "Search 10 job boards across Europe & Turkey at once",
  "Resume bullets & cover letters tailored per application",
  "Follow-up reminders that keep momentum going",
];

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMut = useLogin();
  const registerMut = useRegister();
  const googleMut = useGoogleAuth();
  const pending = loginMut.isPending || registerMut.isPending;

  async function onGoogleCredential(credential: string) {
    setError(null);
    try {
      const res = await googleMut.mutateAsync({ data: { credential } });
      login(res.token, res.user);
    } catch {
      setError("Google sign-in failed. Try again.");
    }
  }

  function extractError(e: unknown): string {
    if (e instanceof ApiError) {
      const data = e.data as { error?: string } | undefined;
      if (data?.error) {
        if (e.status === 400) {
          return mode === "register"
            ? "Username must be 3+ chars (letters, numbers, _) and password 6+ chars."
            : "Invalid input.";
        }
        return data.error;
      }
    }
    return "Something went wrong. Try again.";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const mut = mode === "login" ? loginMut : registerMut;
      const res = await mut.mutateAsync({ data: { username, password } });
      login(res.token, res.user);
    } catch (err) {
      setError(extractError(err));
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 animate-rise">
      {/* Marketing panel */}
      <div
        className="hidden md:flex flex-col justify-between p-11"
        style={{ background: "linear-gradient(165deg, hsl(var(--sidebar)), hsl(var(--ember-tint)) 60%, hsl(var(--ember-tint-border)))" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] bg-ember text-primary-foreground">
            <Briefcase size={18} />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">JobTrack</span>
        </div>
        <div>
          <h1 className="font-display text-[42px] leading-[1.12] font-bold tracking-tight max-w-[420px] text-balance">
            The job hunt is hard. Your tracker shouldn't be.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground max-w-[400px] text-balance">
            One calm place for every application — with AI-tailored materials, ten job boards in one search, and gentle reminders so nothing slips.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          {BULLETS.map((bullet) => (
            <div key={bullet} className="flex items-center gap-2 text-[13.5px] font-medium">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sage text-primary-foreground shrink-0">
                <Check size={11} strokeWidth={3} />
              </span>
              {bullet}
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-10">
        <div className="w-full max-w-[360px]">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-1">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </h2>
          <p className="text-[14.5px] text-muted-foreground mb-6">
            {mode === "login"
              ? "Pick up where you left off."
              : "Pick a username and password to get started."}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username" className="text-[13px] font-semibold text-muted-foreground">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="input-username"
                className="h-11 rounded-[11px] focus-visible:border-ember"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-semibold text-muted-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
                className="h-11 rounded-[11px] focus-visible:border-ember"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="auth-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-[46px] rounded-[11px] text-[14.5px] font-bold"
              disabled={pending}
              data-testid="button-submit"
            >
              {pending
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <div className="my-[18px] flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton onCredential={onGoogleCredential} />
          </div>

          <div className="mt-[18px] text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  className="text-ember font-semibold hover:underline"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  data-testid="link-register"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  className="text-ember font-semibold hover:underline"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  data-testid="link-login"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
