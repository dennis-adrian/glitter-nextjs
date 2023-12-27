import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: '#f6eabd',
        'accent-dark': '#e9d9a9',
        'dark-blue': '#14252E',
        'gradient-darker': '#2D2156',
        'gradient-dark': '#4B3988',
        'gradient-light': '#DFBAE0',
        primary: '#4b3988',
        'primary-dark': '#2d2156',
        secondary: '#f55da5',
        'secondary-dark': '#d13e8f',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      'hero-pattern': 'url("/img/hero-pattern.png")',
    },
    fontFamily: {
      heading: ['Junegull'],
    },
  },
};
export default config;
