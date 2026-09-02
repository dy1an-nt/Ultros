import { ImageResponse } from "next/og"

export const alt = "Ultros: AI evaluation and prompt experimentation platform"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Colors mirror the landing page palette (app/page.tsx); Satori only supports
// flexbox, so every multi-child element is an explicit flex container.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0B0F0D",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={56} height={56} viewBox="0 0 32 32" fill="none">
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
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: "#ECF1ED" }}>
            Ultros
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.14em",
              color: "#7FD6AE",
            }}
          >
            AI EVALUATION &amp; PROMPT EXPERIMENTATION
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.1,
              color: "#ECF1ED",
              maxWidth: 900,
            }}
          >
            Ship prompt changes with evidence.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#9FAFA4" }}>
            Every run scored. Every regression caught.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 24, color: "#76867B" }}>ultros.vercel.app</div>
      </div>
    ),
    { ...size }
  )
}
