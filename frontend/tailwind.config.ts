import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#075e54',
          dark: '#054c44',
        },
        secondary: {
          DEFAULT: '#128c7e',
          dark: '#0a7441',
        },
        chat: {
          bg: '#efeae2',
          bubble: {
            me: '#128c7e',
            partner: '#ffffff',
            system: '#ffd279',
          },
        },
      },
      height: {
        'chat': 'calc(100vh - 220px)',
      },
      maxHeight: {
        'chat': 'calc(100vh - 220px)',
      },
    },
  },
  plugins: [],
}

export default config 