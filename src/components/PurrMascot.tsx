"use client";

interface PurrMascotProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/** Stylized Purr cat mascot SVG inspired by Hyperliquid's Hypurr */
export default function PurrMascot({
  size = 40,
  className = "",
  animated = false,
}: PurrMascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? "animate-float" : ""} ${className}`}
    >
      {/* Glow background */}
      <circle cx="60" cy="65" r="45" fill="url(#purrGlow)" opacity="0.3" />

      {/* Body */}
      <ellipse cx="60" cy="78" rx="28" ry="22" fill="#50e3c2" opacity="0.15" />

      {/* Head */}
      <circle cx="60" cy="55" r="30" fill="#1a3a35" />
      <circle cx="60" cy="55" r="28" fill="#1f4540" />

      {/* Inner face highlight */}
      <ellipse cx="60" cy="52" rx="22" ry="20" fill="#234f48" />

      {/* Left ear */}
      <path
        d="M32 38 L38 15 L52 35 Z"
        fill="#1f4540"
        stroke="#50e3c2"
        strokeWidth="1.5"
        strokeOpacity="0.4"
      />
      <path d="M36 34 L40 20 L49 33 Z" fill="#2a5a52" />

      {/* Right ear */}
      <path
        d="M88 38 L82 15 L68 35 Z"
        fill="#1f4540"
        stroke="#50e3c2"
        strokeWidth="1.5"
        strokeOpacity="0.4"
      />
      <path d="M84 34 L80 20 L71 33 Z" fill="#2a5a52" />

      {/* Left eye */}
      <ellipse cx="47" cy="50" rx="8" ry="9" fill="#0b1410" />
      <ellipse cx="47" cy="50" rx="6.5" ry="7.5" fill="#50e3c2" opacity="0.9" />
      <ellipse cx="47" cy="50" rx="3.5" ry="5" fill="#0b1410" />
      <circle cx="44" cy="47" r="2" fill="white" opacity="0.8" />

      {/* Right eye */}
      <ellipse cx="73" cy="50" rx="8" ry="9" fill="#0b1410" />
      <ellipse cx="73" cy="50" rx="6.5" ry="7.5" fill="#50e3c2" opacity="0.9" />
      <ellipse cx="73" cy="50" rx="3.5" ry="5" fill="#0b1410" />
      <circle cx="70" cy="47" r="2" fill="white" opacity="0.8" />

      {/* Nose */}
      <path
        d="M57 60 L60 63 L63 60 Z"
        fill="#50e3c2"
        opacity="0.6"
      />

      {/* Mouth */}
      <path
        d="M54 65 Q57 69 60 65 Q63 69 66 65"
        stroke="#50e3c2"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />

      {/* Whiskers left */}
      <line x1="20" y1="54" x2="40" y2="58" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />
      <line x1="22" y1="60" x2="40" y2="62" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />
      <line x1="24" y1="66" x2="41" y2="65" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />

      {/* Whiskers right */}
      <line x1="100" y1="54" x2="80" y2="58" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />
      <line x1="98" y1="60" x2="80" y2="62" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />
      <line x1="96" y1="66" x2="79" y2="65" stroke="#50e3c2" strokeWidth="1" opacity="0.3" />

      {/* Tail */}
      <path
        d="M88 78 Q100 72 105 60 Q108 52 102 48"
        stroke="#50e3c2"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />

      <defs>
        <radialGradient id="purrGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#50e3c2" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#50e3c2" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
