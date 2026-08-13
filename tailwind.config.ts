import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f1e8d3",
        creamCard: "#fbf6e9",
        ink: "#2a2420",
        inkSoft: "#5c5347",
        green: "#3e5c43",
        greenDark: "#2c4230",
        greenPale: "#dce5da",
        amber: "#c68a2a",
        amberDark: "#9c6c1e",
        brick: "#a34a30",
        line: "#ded0ac",
      },
    },
  },
  plugins: [],
};
export default config;
