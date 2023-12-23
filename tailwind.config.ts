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
        'dark-blue': '#14252E',
        'gradient-darker': '#2D2156',
        'gradient-dark': '#4B3988',
        'gradient-light': '#DFBAE0',
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
  daisyui: {
    themes: [
      {
        mytheme: {
          primary: '#4b3988',
          secondary: '#f55da5',
          accent: '#f6eabd',
          neutral: '#2a323c',
          'base-100': '#fff',
          info: '#3abff8',
          success: '#36d399',
          warning: '#fbbd23',
          error: '#f87272',
        },
      },
    ],
  },
  plugins: [require('daisyui')],
};
export default config;
