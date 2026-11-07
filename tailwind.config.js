/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base:    '#0a0a0a',  // pure near-black background
          sidebar: '#111111',  // sidebar panel
          card:    '#161616',  // dark card cells
          hover:   '#1c1c1c',  // hover state
          surface: '#1f1f1f',  // elevated surface
          border:  'rgba(255,255,255,0.07)',
        },
        txt: {
          primary:  '#f0f0f0',
          secondary: '#888888',
          muted:    '#555555',
        },
        accent: {
          DEFAULT: '#1a73e8',   // Google-style primary blue
          light:   '#4285f4',   // Google blue lighter
          hover:   '#669df6',
          subtle:  'rgba(66, 133, 244, 0.18)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '5px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.5)',
        modal: '0 24px 64px rgba(0,0,0,0.8)',
        googleGlow: '0 0 14px rgba(66, 133, 244, 0.35)',
      },
    },
  },
  plugins: [],
}
