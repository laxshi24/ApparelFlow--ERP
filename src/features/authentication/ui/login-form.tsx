"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { describedBy, Field, Input } from "@/components/ui/form";
import { loginAction, type LoginState } from "../server/auth.actions";

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-4" aria-label="Sign in">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Email" required error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@apparelflow.lk"
          defaultValue={state.email}
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
