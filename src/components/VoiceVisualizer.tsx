"use client";

interface VoiceVisualizerProps {
  audioLevel: number; // 0-1
  isActive: boolean;
  size?: number;
}

export default function VoiceVisualizer({
  audioLevel,
  isActive,
  size = 120,
}: VoiceVisualizerProps) {
  const bars = 24;
  const baseRadius = size * 0.28;
  const maxBarHeight = size * 0.18;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle, rgba(255, 107, 107, ${0.08 + audioLevel * 0.15}) 0%, transparent 70%)`,
            transform: `scale(${1.2 + audioLevel * 0.3})`,
          }}
        />
      )}

      {/* SVG visualization */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: bars }).map((_, i) => {
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const variance = Math.sin(i * 0.7 + Date.now() * 0.003) * 0.3 + 0.7;
          const barHeight = isActive
            ? maxBarHeight * (0.15 + audioLevel * 0.85 * variance)
            : maxBarHeight * 0.1;

          const cx = size / 2;
          const cy = size / 2;
          const x1 = cx + Math.cos(angle) * baseRadius;
          const y1 = cy + Math.sin(angle) * baseRadius;
          const x2 = cx + Math.cos(angle) * (baseRadius + barHeight);
          const y2 = cy + Math.sin(angle) * (baseRadius + barHeight);

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isActive ? "#ff6b6b" : "#4a4a5a"}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={isActive ? 0.6 + audioLevel * 0.4 : 0.3}
              style={{
                transition: "all 0.08s ease-out",
              }}
            />
          );
        })}

        {/* Center circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={baseRadius - 4}
          fill={isActive ? "rgba(255, 107, 107, 0.15)" : "rgba(74, 74, 90, 0.1)"}
          stroke={isActive ? "#ff6b6b" : "#4a4a5a"}
          strokeWidth={1.5}
          opacity={isActive ? 0.8 : 0.3}
        />
      </svg>
    </div>
  );
}
