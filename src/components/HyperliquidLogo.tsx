"use client";

interface HyperliquidLogoProps {
  size?: number;
  className?: string;
}

/** Hyperliquid-style geometric logo */
export default function HyperliquidLogo({
  size = 24,
  className = "",
}: HyperliquidLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle with glow */}
      <circle cx="50" cy="50" r="48" fill="#0f1318" />
      <circle cx="50" cy="50" r="46" fill="url(#hlLogoBg)" />

      {/* HL geometric mark - stylized angular shape */}
      <path
        d="M30 28 L42 28 L42 45 L58 45 L58 28 L70 28 L70 72 L58 72 L58 55 L42 55 L42 72 L30 72 Z"
        fill="url(#hlLogoGrad)"
      />

      <defs>
        <linearGradient id="hlLogoGrad" x1="30" y1="28" x2="70" y2="72">
          <stop offset="0%" stopColor="#50e3c2" />
          <stop offset="100%" stopColor="#3cc4a7" />
        </linearGradient>
        <radialGradient id="hlLogoBg" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#152520" />
          <stop offset="100%" stopColor="#0f1318" />
        </radialGradient>
      </defs>
    </svg>
  );
}
