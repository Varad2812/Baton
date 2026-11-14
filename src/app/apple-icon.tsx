import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#E8A33D",
        }}
      >
        <div style={{ display: "flex", width: 38, height: 124, background: "#0B0D15", borderRadius: 18, transform: "rotate(35deg)" }} />
      </div>
    ),
    { ...size },
  );
}
