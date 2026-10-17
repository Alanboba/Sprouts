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
    text: '#20362A',
    tint: '#385E43',
    background: '#F4F5EC',
    foreground: '#20362A',
    card: '#FFFFFF',
    cardForeground: '#20362A',
    primary: '#385E43',
    primaryForeground: '#FFFFFF',
    secondary: '#E6EDE0',
    secondaryForeground: '#2C4935',
    muted: '#E9EDE5',
    mutedForeground: '#718073',
    accent: '#E7B273',
    accentForeground: '#3E3022',
    destructive: '#B94C3C',
    destructiveForeground: '#FFFFFF',
    border: '#DCE4D9',
    input: '#DCE4D9',
  },

  radius: 22,
};

export default colors;
