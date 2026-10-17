/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#202D43',
    tint: '#C85E43',
    background: '#F5EFDF',
    foreground: '#202D43',
    card: '#FAF6EB',
    cardForeground: '#202D43',
    primary: '#C85E43',
    primaryForeground: '#FFF8EB',
    secondary: '#ECE2CE',
    secondaryForeground: '#202D43',
    muted: '#EEE6D6',
    mutedForeground: '#74766E',
    accent: '#E6BD68',
    accentForeground: '#3B3324',
    destructive: '#AD4C36',
    destructiveForeground: '#FFFFFF',
    border: '#DED3BD',
    input: '#C8BEAA',
  },

  radius: 4,
};

export default colors;
