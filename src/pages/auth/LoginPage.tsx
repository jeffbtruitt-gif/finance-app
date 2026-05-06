import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/api/auth';
import { Brand, Button } from '@/components/ds';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy-900 px-4">
      {/* Soft radial accent — gold glow behind the card to hint at the brand
          without dominating. Subtle on small screens, larger on wide. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 30%, rgba(201,168,76,0.25), transparent 60%), radial-gradient(circle at 70% 80%, rgba(59,85,154,0.45), transparent 55%)',
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-xl border border-navy-700 bg-white p-7 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <Brand size="md" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Family
          </span>
        </div>
        <div className="mb-5 text-sm text-gray-500">Sign in to continue.</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoFocus
          />
          <Field
            label="Password"
            type="password"
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
  type,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <input
        type={type}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-shadow focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
      />
    </div>
  );
}
