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
    text: '#24392F',
    tint: '#446B55',
    background: '#F2F5EF',
    foreground: '#24392F',
    card: '#FBFCF9',
    cardForeground: '#24392F',
    primary: '#446B55',
    primaryForeground: '#F8FBF6',
    secondary: '#E2EBE1',
    secondaryForeground: '#355442',
    muted: '#E9EFE8',
    mutedForeground: '#68776C',
    accent: '#B48A45',
    accentForeground: '#3D3424',
    destructive: '#A34F42',
    destructiveForeground: '#FFF9F6',
    border: '#D7E1D6',
    input: '#B9C9B9',
  },

  radius: 12,
};

export default colors;
