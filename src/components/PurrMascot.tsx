"use client";

interface PurrMascotProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/** Cute Purr cat mascot - white cat with blue-gray stripes like Hyperliquid's Purr */
export default function PurrMascot({
  size = 40,
  className = "",
  animated = false,
}: PurrMascotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? "animate-float" : ""} ${className}`}
    >
      {/* Soft glow behind */}
      <circle cx="100" cy="110" r="70" fill="url(#purrGlow2)" opacity="0.4" />

      {/* Body */}
      <ellipse cx="100" cy="155" rx="40" ry="30" fill="#f0f0f5" />
      <ellipse cx="100" cy="155" rx="36" ry="27" fill="#f8f8fc" />
      {/* Body stripe */}
      <ellipse cx="100" cy="148" rx="8" ry="14" fill="#b8c4d8" opacity="0.3" />

      {/* Tail */}
      <path
        d="M140 155 Q160 140 165 120 Q168 108 160 100"
        stroke="#b8c4d8"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M140 155 Q160 140 165 120 Q168 108 160 100"
        stroke="#f0f0f5"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Tail stripes */}
      <path d="M155 130 Q158 126 156 122" stroke="#b8c4d8" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M160 118 Q163 114 161 110" stroke="#b8c4d8" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Head - big round */}
      <circle cx="100" cy="85" r="52" fill="#e8e8f0" />
      <circle cx="100" cy="85" r="50" fill="#f5f5fa" />

      {/* Head highlight */}
      <ellipse cx="92" cy="72" rx="30" ry="25" fill="white" opacity="0.5" />

      {/* Left ear outer */}
      <path d="M55 60 L48 18 L82 50 Z" fill="#e8e8f0" />
      {/* Left ear inner pink */}
      <path d="M60 55 L53 25 L77 48 Z" fill="#ffb8c6" opacity="0.6" />

      {/* Right ear outer */}
      <path d="M145 60 L152 18 L118 50 Z" fill="#e8e8f0" />
      {/* Right ear inner pink */}
      <path d="M140 55 L147 25 L123 48 Z" fill="#ffb8c6" opacity="0.6" />

      {/* Head stripes - blue-gray */}
      <path d="M80 42 Q85 35 90 42" stroke="#9aa8c0" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M92 38 Q97 30 102 38" stroke="#9aa8c0" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M104 42 Q109 35 114 42" stroke="#9aa8c0" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.5" />

      {/* Left eye - big anime style */}
      <ellipse cx="78" cy="82" rx="14" ry="16" fill="#1a1a2e" />
      <ellipse cx="78" cy="84" rx="12" ry="13" fill="#222240" />
      {/* Left eye shine */}
      <circle cx="73" cy="78" r="5" fill="white" opacity="0.9" />
      <circle cx="82" cy="88" r="3" fill="white" opacity="0.5" />

      {/* Right eye - big anime style */}
      <ellipse cx="122" cy="82" rx="14" ry="16" fill="#1a1a2e" />
      <ellipse cx="122" cy="84" rx="12" ry="13" fill="#222240" />
      {/* Right eye shine */}
      <circle cx="117" cy="78" r="5" fill="white" opacity="0.9" />
      <circle cx="126" cy="88" r="3" fill="white" opacity="0.5" />

      {/* Blush marks */}
      <ellipse cx="62" cy="95" rx="8" ry="5" fill="#ffb8c6" opacity="0.3" />
      <ellipse cx="138" cy="95" rx="8" ry="5" fill="#ffb8c6" opacity="0.3" />

      {/* Nose - small pink triangle */}
      <path d="M96 96 L100 101 L104 96 Z" fill="#ffb0c0" />

      {/* Mouth - cute cat smile */}
      <path
        d="M92 104 Q96 110 100 104 Q104 110 108 104"
        stroke="#9a8a9a"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Whiskers */}
      <line x1="40" y1="90" x2="65" y2="94" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="38" y1="98" x2="64" y2="99" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="106" x2="66" y2="104" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />

      <line x1="160" y1="90" x2="135" y2="94" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="162" y1="98" x2="136" y2="99" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="158" y1="106" x2="134" y2="104" stroke="#c8c8d8" strokeWidth="1.5" strokeLinecap="round" />

      {/* Front paws */}
      <ellipse cx="80" cy="172" rx="14" ry="8" fill="#f0f0f5" />
      <ellipse cx="120" cy="172" rx="14" ry="8" fill="#f0f0f5" />
      {/* Paw pads */}
      <circle cx="76" cy="173" r="2.5" fill="#ffb8c6" opacity="0.4" />
      <circle cx="82" cy="174" r="2.5" fill="#ffb8c6" opacity="0.4" />
      <circle cx="116" cy="173" r="2.5" fill="#ffb8c6" opacity="0.4" />
      <circle cx="122" cy="174" r="2.5" fill="#ffb8c6" opacity="0.4" />

      <defs>
        <radialGradient id="purrGlow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#50e3c2" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#50e3c2" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
