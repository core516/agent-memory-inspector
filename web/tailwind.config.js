/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Cartoon-flat palette — cream base with soft candy accents.
        cream:      '#FFF8EC', // page background
        ink:        '#3A2D4A', // primary text (soft dark plum)
        muted:      '#9286A8', // secondary text
        purple:     '#9B7EDE',
        purpleDeep: '#7B5FC9',
        mint:       '#6FE0C8',
        sky:        '#6FC3FF',
        sun:        '#FFD45E',
        orange:     '#FFA45B',
        coral:      '#FF7E7E',
        accent:     '#9B7EDE', // legacy alias → purple
      },
      fontFamily: {
        // Rounded display face for headings; Noto Sans SC carries CJK body text.
        display: ['"Baloo 2"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        sans: ['"Noto Sans SC"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Soft, diffuse depth — never hard offset shadows.
        soft:    '0 6px 16px rgba(58,45,74,.10)',
        'soft-lg': '0 10px 22px rgba(58,45,74,.14)',
      },
      borderRadius: {
        card: '18px',
      },
      transitionTimingFunction: {
        // Springy entrance / interaction easing.
        bounce: 'cubic-bezier(.34,1.56,.64,1)',
      },
    },
  },
  plugins: [],
};
