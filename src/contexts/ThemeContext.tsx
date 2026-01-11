"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }
  return "system";
}

function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches 
      ? "dark" 
      : "light";
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => getResolvedTheme(getInitialTheme()));

  useEffect(() => {
    const root = document.documentElement;
    
    // Limpiar clases previas
    root.classList.remove("light", "dark");
    
    const effectiveTheme = getResolvedTheme(theme);
    root.classList.add(effectiveTheme);
    setResolvedTheme(effectiveTheme);
    
    // Guardar en localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Escuchar cambios en preferencia del sistema (solo cuando theme === "system")
  useEffect(() => {
    if (theme !== "system") return;
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const effectiveTheme = mediaQuery.matches ? "dark" : "light";
      setResolvedTheme(effectiveTheme);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(effectiveTheme);
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // Escuchar cambios en preferencia del sistema
  useEffect(() => {
    if (theme !== "system") return;
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const effectiveTheme = mediaQuery.matches ? "dark" : "light";
      setResolvedTheme(effectiveTheme);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(effectiveTheme);
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}