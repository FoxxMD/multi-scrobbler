/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
      "index.html"
  ],
  theme: {
    container: {
      padding: '1rem',
    },
    extend: {
      screens: {
      'md': '1024px'
      }
    },
  },
  plugins: [],
}
