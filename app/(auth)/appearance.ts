// Clerk theme matched to the design system (docs/design/Ultros Style Guide):
// dark green surface #121815, brand #4FB286, ink #ECF1ED.
// clerk-js v6 renamed the text/input variables (colorText → colorForeground,
// etc.) and silently ignores the old names — keep both so either runtime works.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#4FB286",
    colorPrimaryForeground: "#07130D",
    colorBackground: "#121815",
    // social-button text, borders, and other derived shades mix from this;
    // its default is black, which vanishes on the dark card
    colorNeutral: "#ECF1ED",
    colorForeground: "#ECF1ED",
    colorMutedForeground: "#9FAFA4",
    colorInput: "#18201C",
    colorInputForeground: "#ECF1ED",
    colorBorder: "#2A362F",
    colorDanger: "#D26A5D",
    borderRadius: "8px",
    // legacy (pre-v6) names
    colorText: "#ECF1ED",
    colorTextSecondary: "#9FAFA4",
    colorInputBackground: "#18201C",
    colorInputText: "#ECF1ED",
  },
  elements: {
    card: { border: "1px solid #1B231F", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" },
    formButtonPrimary: { color: "#07130D", fontWeight: 600 },
  },
}
