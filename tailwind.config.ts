import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

export default {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm ink grays (Tailwind stone) instead of cool grays — the whole
        // product reads like ink on paper rather than a default admin panel.
        gray: colors.stone,
      },
      fontFamily: {
        // Fraunces: serif display for ledger numerals and greetings in the app
        ledger: ['"Fraunces"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
