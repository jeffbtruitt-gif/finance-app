import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/api/auth';
import { Button } from '@/components/ds';
import { ParticleSky } from '@/components/auth/ParticleSky';

const LOGO_SRC = `${import.meta.env.BASE_URL}truitt-finance-logo.png`;

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to={returnTo} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy-900 px-4 overflow-hidden">
      <ParticleSky />
      <div className="relative w-full max-w-sm rounded-xl border border-navy-700 bg-white p-7 shadow-xl">
        <div className="mb-6 flex justify-center">
          <img
            src={LOGO_SRC}
            alt="Truitt Finance"
            className="h-auto w-full max-w-[160px] object-contain select-none"
            draggable={false}
          />
        </div>
        <div className="mb-5 text-sm text-gray-500">Sign in to continue.</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            label="Email"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            autoFocus
          />
          <Field
            label="Password"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
          {error && (
            <div className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-xs text-neg">
              {error}
            </div>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-5 text-center text-xs text-gray-500">
          <Link
            to="/reset-password"
            className="text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  name,
  type,
  autoComplete,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  id: string;
  name: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-shadow focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
      />
    </div>
  );
}
