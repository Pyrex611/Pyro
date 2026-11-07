import type { Config } from "tailwindcss";

export default {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--accent)",
          subtle: "var(--accent-bg)",
          hover: "#0b5442",
        },
        surface: {
          canvas: "var(--bg)",
          card: "var(--surface)",
        },
      },
    },
  },
} satisfies Config;