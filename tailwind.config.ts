import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Lexend: the Streamflaire display face — headings, nav labels, numerals
        display: ['"Lexend"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
