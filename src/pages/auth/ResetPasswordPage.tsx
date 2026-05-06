import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/api/auth';
import { Brand, Button } from '@/components/ds';

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await resetPassword(email);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy-900 px-4">
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
            Reset
          </span>
        </div>
        <div className="mb-1 text-h3 text-navy-900">Reset password</div>
        <div className="mb-5 text-sm text-gray-500">
          Enter your email; we'll send a reset link.
        </div>
        {sent ? (
          <div className="rounded-md border border-pos/30 bg-pos-soft px-3 py-2 text-sm text-pos">
            If an account exists for that email, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-shadow focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
              />
            </div>
            {error && (
              <div className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-xs text-neg">
                {error}
              </div>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-xs text-gray-500">
          <Link
            to="/login"
            className="text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
