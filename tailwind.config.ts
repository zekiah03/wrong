import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Hiragino Maru Gothic ProN"',
          '"Hiragino Maru Gothic Pro"',
          '"Yu Gothic Medium"',
          '"YuGothic"',
          '"Rounded Mplus 1c"',
          '"M PLUS Rounded 1c"',
          '"Hiragino Kaku Gothic ProN"',
          "Meiryo",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          '"Hiragino Mincho ProN"',
          '"Yu Mincho"',
          '"Noto Serif JP"',
          "serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
      borderRadius: {
        squish: "22px",
      },
    },
  },
  plugins: [],
};

export default config;
