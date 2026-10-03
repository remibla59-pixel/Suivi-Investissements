// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    // Ceci est essentiel pour que Tailwind analyse vos fichiers source
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  // Le thème suit la classe .dark posée par le bouton lune/soleil de l'appli : sans ce
  // réglage, Tailwind utilise « media » et le mode sombre s'active selon le système,
  // ce qui casse le style papier même quand le bouton est sur clair.
  darkMode: 'class',
  theme: {
    extend: {
      // Palette « encre de nuit » : le mode sombre reprend l'identité du carnet
      // (papier ivoire le jour, encre chaude la nuit) plutôt que le bleu-gris d'origine.
      colors: {
        slate: {
          50: '#F6F4EE',
          100: '#E8E4DA',
          200: '#C9CFD8',
          300: '#B4BCC8',
          400: '#98A2B3',
          500: '#7C8697',
          600: '#33405A',
          700: '#2A3546',
          800: '#17202E',
          900: '#0E1626',
          950: '#0A111C',
        },
      },
    },
  },
  plugins: [],
}