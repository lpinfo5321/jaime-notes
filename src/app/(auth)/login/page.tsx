import LoginClient from "./LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const nextUrl = typeof sp.next === "string" && sp.next ? sp.next : "/app";
  return <LoginClient nextUrl={nextUrl} />;
}

