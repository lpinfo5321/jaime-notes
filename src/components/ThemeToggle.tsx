"use client";

import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const getIcon = () => {
    if (theme === "system") {
      return "🖥️";
    }
    return resolvedTheme === "dark" ? "🌙" : "☀️";
  };

  const getLabel = () => {
    if (theme === "system") return "Sistema";
    return resolvedTheme === "dark" ? "Oscuro" : "Claro";
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200",
        "hover:scale-105 active:scale-95",
        // Modo claro
        "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
        // Modo oscuro
        "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      )}
      title={`Cambiar tema (actual: ${getLabel()})`}
    >
      <span className="text-base transition-transform duration-300 hover:rotate-12">
        {getIcon()}
      </span>
      <span className="hidden sm:inline">{getLabel()}</span>
    </button>
  );
}