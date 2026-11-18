/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './dashboard.html', './login.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        senai: {
          // Marca
          navy: '#003B5C',
          dark: '#003B5C', // alias legado (mesmo navy)
          orange: '#F26522',
          'orange-ink': '#B23A0B',
          orangeDeep: '#B23A0B', // alias legado
          ink: '#0B1F33',
          bg: '#F5F7FA',
          line: '#E5EAF0',
          mist: '#EEF3F7'
        }
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        lift: '0 22px 42px -24px rgba(0, 59, 92, .6)',
        toast: '0 24px 48px -18px rgba(0, 59, 92, .28), 0 2px 8px rgba(0, 59, 92, .06)',
        soft: '0 1px 2px rgba(3, 32, 48, .03), 0 16px 32px -22px rgba(3, 32, 48, .18)',
        card: '0 1px 2px rgba(3, 32, 48, .04), 0 24px 48px -28px rgba(3, 32, 48, .25)'
      }
    }
  },
  plugins: []
};
