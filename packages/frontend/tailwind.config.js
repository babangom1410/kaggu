/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        course: {
          DEFAULT: '#3B82F6',
          light: '#EFF6FF',
          border: '#BFDBFE',
        },
        section: {
          DEFAULT: '#10B981',
          light: '#ECFDF5',
          border: '#A7F3D0',
        },
        resource: {
          DEFAULT: '#F59E0B',
          light: '#FFFBEB',
          border: '#FDE68A',
        },
        activity: {
          DEFAULT: '#8B5CF6',
          light: '#F5F3FF',
          border: '#DDD6FE',
        },
      },
      boxShadow: {
        node: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
        'node-hover': '0 4px 8px rgba(0,0,0,0.10), 0 12px 24px rgba(0,0,0,0.08)',
        topbar: '0 1px 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
};
