import LoginClient from "./LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const nextUrl = typeof sp.next === "string" && sp.next ? sp.next : "/app";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-900">
      <LoginClient nextUrl={nextUrl} />
    </div>
  );
}

