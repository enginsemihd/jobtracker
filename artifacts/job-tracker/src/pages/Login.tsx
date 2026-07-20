import { useState } from "react";
import { Briefcase } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Briefcase className="text-primary" size={26} />
          <span className="text-xl font-semibold tracking-tight">JobTrack</span>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold mb-1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-5">
            {mode === "login"
              ? "Welcome back. Enter your credentials."
              : "Pick a username and password to get started."}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="input-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
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
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="auth-error">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
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

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton onCredential={onGoogleCredential} />
          </div>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  data-testid="link-register"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
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
