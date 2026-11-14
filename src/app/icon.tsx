import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        {/* baton: a tilted bar */}
        <div style={{ display: "flex", width: 7, height: 22, background: "#0B0D15", borderRadius: 3, transform: "rotate(35deg)" }} />
      </div>
    ),
    { ...size },
  );
}
