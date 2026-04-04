export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: "#f0f2f5" }}
    >
      {/* Subtle top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: "4px",
        background: "linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)",
      }} />

      {/* Decorative circles (very subtle, light) */}
      <div style={{
        position: "absolute", top: "-100px", right: "-100px",
        width: "400px", height: "400px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-80px", left: "-80px",
        width: "360px", height: "360px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Centered content */}
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
