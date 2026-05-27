/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {}
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        "ai-studio": {
          primary: "#4f46e5",
          "primary-content": "#ffffff",
          secondary: "#334155",
          "secondary-content": "#ffffff",
          accent: "#6366f1",
          "accent-content": "#ffffff",
          neutral: "#1e293b",
          "neutral-content": "#f8fafc",
          "base-100": "#ffffff",
          "base-200": "#f8fafc",
          "base-300": "#e2e8f0",
          "base-content": "#0f172a",
          info: "#0284c7",
          "info-content": "#ffffff",
          success: "#16a34a",
          "success-content": "#ffffff",
          warning: "#d97706",
          "warning-content": "#ffffff",
          error: "#dc2626",
          "error-content": "#ffffff"
        }
      }
    ]
  }
};
