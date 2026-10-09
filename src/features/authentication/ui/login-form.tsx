"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { describedBy, Field, Input } from "@/components/ui/form";
import { ApiClientError, apiFetch } from "@/lib/http/client";
import { firstIssuePerField } from "@/lib/validation";
import { loginSchema } from "../schemas/login.schema";

type LoginResponse = { home: string };

export function useLogin(next: string | null) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(email: string, password: string) {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(firstIssuePerField(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { home } = await apiFetch<LoginResponse>("/api/auth/login", { method: "POST", body: parsed.data });
      router.replace(next ?? home);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Sign-in failed. Please try again.");
      setPending(false);
    }
  }

  return { submit, pending, error, fieldErrors };
}

export function LoginForm({ next }: { next: string | null }) {
  const { submit, pending, error, fieldErrors } = useLogin(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(email, password);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in">
      {error && <Alert tone="error">{error}</Alert>}
      <Field id="email" label="Email" required error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@factory.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={!!fieldErrors.email}
          aria-describedby={describedBy("email", fieldErrors.email)}
          required
        />
      </Field>
      <Field id="password" label="Password" required error={fieldErrors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={!!fieldErrors.password}
          aria-describedby={describedBy("password", fieldErrors.password)}
          required
        />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        <LogIn aria-hidden className="size-4" />
        Sign in
      </Button>
    </form>
  );
}
