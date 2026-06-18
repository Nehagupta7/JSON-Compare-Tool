import { useState, useEffect, useCallback } from "react";

/**
 * useDarkMode.js
 *
 * A small, reusable dark/light mode hook for Tailwind v4 projects.
 *
 * Behavior:
 *   - On first load, respects the user's OS preference (prefers-color-scheme)
 *   - After that, remembers their explicit choice in localStorage
 *   - Toggles the `dark` class on <html>, which is what your
 *     `@variant dark (&:where(.dark, .dark *));` line in index.css listens for
 *
 * Usage:
 *   const { isDark, toggle, setTheme } = useDarkMode();
 *   <button onClick={toggle}>{isDark ? "Light mode" : "Dark mode"}</button>
 */

const STORAGE_KEY = "theme"; // "light" | "dark"

function getInitialTheme() {
    if (typeof window === "undefined") return "light";

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;

    // No explicit choice yet — fall back to OS preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
}

export function useDarkMode() {
    const [theme, setThemeState] = useState(getInitialTheme);

    // Apply the class to <html> whenever theme changes
    useEffect(() => {
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    // Keep in sync if the user changes OS theme AND hasn't made an explicit choice
    useEffect(() => {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e) => {
            const hasExplicitChoice = localStorage.getItem(STORAGE_KEY);
            // Only auto-follow OS if user never explicitly toggled in this browser
            if (!hasExplicitChoice) {
                setThemeState(e.matches ? "dark" : "light");
            }
        };
        mql.addEventListener("change", handleChange);
        return () => mql.removeEventListener("change", handleChange);
    }, []);

    const setTheme = useCallback((next) => {
        setThemeState(next);
    }, []);

    const toggle = useCallback(() => {
        setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
    }, []);

    return { theme, isDark: theme === "dark", toggle, setTheme };
}