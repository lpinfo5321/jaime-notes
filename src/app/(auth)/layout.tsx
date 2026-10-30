export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Halos decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(163,230,53,0.35), transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.28), transparent 65%)" }}
      />

      <div className="relative flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}
