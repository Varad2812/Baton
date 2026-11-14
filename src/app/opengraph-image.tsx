import { ImageResponse } from "next/og";

export const alt = "Baton: hand over the project, not just the files.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GRADES = ["#1F9E89", "#4C7BD9", "#E8A33D", "#E2574C", "#8A8FA3"];

// Isometric cube from three rhombus faces, drawn with rotated divs.
function Cube({ x, y, color, s = 72 }: { x: number; y: number; color: string; s?: number }) {
  const h = s / 2;
  const face = (extra: React.CSSProperties, shade: number) => (
    <div
      style={{
        position: "absolute",
        width: s,
        height: s,
        background: color,
        opacity: shade,
        ...extra,
      }}
    />
  );
  return (
    <div style={{ position: "absolute", left: x, top: y, width: s, height: s, display: "flex" }}>
      {face({ left: 0, top: -h * 0.6, transform: "scaleY(0.5) rotate(45deg)", transformOrigin: "center" }, 1)}
      {face({ left: -h * 0.5, top: h * 0.55, transform: "skewY(30deg) scaleX(0.7)", transformOrigin: "center" }, 0.62)}
      {face({ left: h * 0.5, top: h * 0.55, transform: "skewY(-30deg) scaleX(0.7)", transformOrigin: "center" }, 0.8)}
    </div>
  );
}

export default function OgImage() {
  const chips = ["Traceable", "Actionable", "Permission-aware"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0B0D15",
          color: "#E8EAF2",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px", width: 700 }}>
          <div style={{ display: "flex", fontSize: 22, color: "#E8A33D", letterSpacing: 2 }}>KNOWLEDGE HANDOVER</div>
          <div style={{ display: "flex", fontSize: 148, fontFamily: "serif", fontWeight: 600, lineHeight: 1.05, marginTop: 12 }}>
            Baton
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#A9AEC2", marginTop: 12, lineHeight: 1.3 }}>
            Hand over the project, not just the files.
          </div>
          <div style={{ display: "flex", marginTop: 40 }}>
            {chips.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  marginRight: 12,
                  padding: "8px 16px",
                  border: "1px solid #252A3A",
                  background: "#11141F",
                  borderRadius: 8,
                  fontSize: 22,
                  color: "#E8EAF2",
                }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", left: 700, top: 0, width: 500, height: 630 }}>
          {/* Stack of sources rising to the handover: lowest block left, tallest right */}
          <Cube x={40} y={400} color={GRADES[4]} />
          <Cube x={140} y={350} color={GRADES[1]} />
          <Cube x={240} y={300} color={GRADES[0]} />
          <Cube x={140} y={250} color={GRADES[2]} />
          <Cube x={240} y={200} color={GRADES[3]} />
          <Cube x={340} y={250} color={GRADES[0]} />
        </div>
        <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, width: "100%", height: 6, background: "#E8A33D" }} />
      </div>
    ),
    { ...size },
  );
}
