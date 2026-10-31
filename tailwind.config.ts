import type { Config } from "tailwindcss";

// Brand palette shared with the coffeehouseangren.uz landing page
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ember: { DEFAULT: "#71292A", dark: "#5a2021" },
        foam: "#F3E6DA",
        rose: "#F5C9BD",
        bean: "#251B14",
        cream: "#FBF7F3",
        line: "#E5DDD4",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        poster: ['"Antonio"', '"Arial Narrow"', "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
