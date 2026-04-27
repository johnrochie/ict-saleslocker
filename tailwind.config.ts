import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Arial', 'Helvetica Neue', 'Helvetica', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#fdf0f4',
          100: '#fce0ea',
          200: '#f9c2d4',
          300: '#f490b0',
          400: '#ee5f8c',
          500: '#D4145A',
          600: '#be1251',
          700: '#a01044',
          800: '#7d0d36',
          900: '#5a0927',
        },
        navy: {
          700: '#1A3A5C',
          800: '#142d47',
          900: '#0e2033',
        },
        body: '#595959',
      },
    },
  },
  plugins: [],
}

export default config
