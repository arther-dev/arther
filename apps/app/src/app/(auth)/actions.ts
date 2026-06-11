'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { slugifyWorkspaceName, workspaceSlugSchema } from '@arther/types';
import { getSupabaseServer } from '../../lib/supabase/server';

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Success confirmations for stay-on-page flows (forgot/reset). */
  done?: boolean;
}

const NOT_PROVISIONED =
  'Authentication is not configured in this environment yet — see PROVISIONING.md.';
/** Generic by design: no account enumeration (auth IA §6). */
const INVALID_CREDENTIALS = 'Email or password is incorrect.';

function fieldErrors(parsed: z.SafeParseError<unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export async function logIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed) };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: INVALID_CREDENTIALS };
  redirect('/dashboard');
}

const signUpSchema = credentialsSchema.extend({
  name: z.string().min(1, 'Enter your name.'),
});

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed) };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.name } },
  });
  // "Email already registered" responses are intentionally not distinguished
  // from success (no enumeration); Supabase sends the appropriate email.
  if (error) return { error: 'Could not create the account. Please try again.' };
  redirect('/signup/verify');
}

export async function logOut(): Promise<void> {
  const supabase = await getSupabaseServer();
  if (supabase) await supabase.auth.signOut();
  redirect('/login');
}

const emailSchema = z.object({ email: z.string().email('Enter a valid email address.') });

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed) };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  await supabase.auth.resetPasswordForEmail(parsed.data.email);
  // Always confirm — whether or not the account exists (no enumeration).
  return { done: true };
}

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  });

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed) };

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: 'This reset link is invalid or has expired — request a new one.' };
  return { done: true };
}

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name your workspace.'),
});

export async function createWorkspace(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = createWorkspaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed) };

  const slug = slugifyWorkspaceName(parsed.data.name);
  const slugCheck = workspaceSlugSchema.safeParse(slug);
  if (!slugCheck.success) {
    return { fieldErrors: { name: 'Use at least two letters or numbers.' } };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  // Atomic bootstrap: workspace + owner membership + seeded defaults (0003 RPC).
  const { error } = await supabase.rpc('create_workspace', {
    p_name: parsed.data.name,
    p_slug: slug,
  });
  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      return { fieldErrors: { name: 'That workspace URL is taken — try another name.' } };
    }
    return { error: 'Could not create the workspace. Please try again.' };
  }
  redirect('/dashboard');
}

export async function continueWithGoogle(): Promise<AuthFormState> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { error: NOT_PROVISIONED };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard` },
  });
  if (error || !data.url) return { error: 'Google sign-in is unavailable right now.' };
  redirect(data.url);
}
