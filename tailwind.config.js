/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      colors: {
        oled: {
          bg: '#140202',
          card: '#1f0404',
          red: '#ff1e1e',
          'red-bright': '#ff4d4d',
          'red-dim': '#8b0000',
          glow: 'rgba(255, 30, 30, 0.4)',
        },
        led: {
          orange: '#ff6600',
          'orange-bright': '#ff9933',
          red: '#ee1111',
          'red-bright': '#ff4444',
        },
        pad: {
          base: '#26282e',
          top: '#373a43',
          active: '#e65c00',
          lit: '#ff7700',
        }
      },
      fontFamily: {
        oled: ['"Courier New"', 'Courier', 'monospace'],
        hardware: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'hardware-panel': 'inset 1px 1px 2px rgba(255,255,255,0.04), inset -1px -1px 3px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.4)',
        'beveled-btn': 'inset 1px 1px 1px rgba(255,255,255,0.08), inset -1px -1px 2px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.3)',
        'beveled-btn-pressed': 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -1px -1px 1px rgba(255,255,255,0.03)',
        'oled-glow': 'inset 0 0 12px rgba(0,0,0,0.95), 0 0 15px rgba(255, 30, 30, 0.2)',
        'knob-3d': 'inset 1px 1px 2px rgba(255,255,255,0.1), inset -2px -2px 4px rgba(0,0,0,0.9), 0 3px 8px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
