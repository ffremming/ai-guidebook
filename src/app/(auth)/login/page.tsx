'use client';

import { FormEvent, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(() => '/', []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      name,
      redirect: false,
      redirectTo: callbackUrl,
    });

    setIsLoading(false);

    if (!result || result.error) {
      setError('Unable to sign in. Verify your details and try again.');
      return;
    }

    window.location.href = result.url ?? callbackUrl;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-8">
      <form
        className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">NTNU</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">AI Guidebook</h1>
          <p className="mt-2 text-sm text-slate-700">Sign in with your institution account to continue.</p>
        </div>

        <label className="block text-sm font-medium text-slate-900">
          Name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-900">
          Email
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button
          className="w-full rounded-md bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
