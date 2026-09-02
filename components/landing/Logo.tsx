// Ultros constellation mark, from docs/design (Ultros Style Guide).
export function UltrosLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Ultros logo">
      <path
        d="M16 6L8 16M16 6L24 16M24 16L19 26M24 16L27 26"
        stroke="#4FB286"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="6" r="3" fill="#0B0F0D" stroke="#4FB286" strokeWidth="2" />
      <circle cx="8" cy="16" r="3" fill="#0B0F0D" stroke="#4FB286" strokeWidth="2" />
      <circle cx="24" cy="16" r="3" fill="#0B0F0D" stroke="#4FB286" strokeWidth="2" />
      <circle cx="19" cy="26" r="3" fill="#4FB286" stroke="#4FB286" strokeWidth="2" />
      <circle cx="27" cy="26" r="3" fill="#0B0F0D" stroke="#4FB286" strokeWidth="2" />
    </svg>
  )
}
