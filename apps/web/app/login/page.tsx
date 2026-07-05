import { signIn } from "@/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: {
    callbackUrl?: string;
  };
}) {
  const callbackUrl = searchParams?.callbackUrl ?? "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-50">
      <section className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          Shadow Trader
        </p>
        <h1 className="mt-3 text-2xl font-bold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Continue with GitHub to access your trading research workspace.
        </p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500"
          >
            Continue with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
