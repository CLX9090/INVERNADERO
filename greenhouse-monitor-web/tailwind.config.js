/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        green: {
          500: '#00ff00',
        },
        gray: {
          400: '#9ca3af',
          900: '#111827',
        },
        red: {
          500: '#ff0000',
        },
      },
    },
  },
  plugins: [],
}