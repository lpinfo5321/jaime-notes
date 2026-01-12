import ThemeToggle from "@/components/ThemeToggle";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-10">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}

