'use client';

// ============================================================
// Avatar — SVG circle with initials and a colored background.
// Used for residents and agent groups throughout the UI.
// ============================================================

interface AvatarProps {
  initials: string;
  color: string;
  size?: number;
  className?: string;
  src?: string;
}

export default function Avatar({ initials, color, size = 40, className = '', src }: AvatarProps) {
  if (src) {
    return (
      <div
        className={`flex-shrink-0 overflow-hidden relative ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(6, size * 0.22),
          border: `1.5px solid ${color}88`,
          background: `${color}22`,
        }}
      >
        <img
          src={src}
          alt={initials}
          className="w-full h-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    );
  }

  const fontSize = Math.round(size * 0.33);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`flex-shrink-0 rounded-lg overflow-hidden ${className}`}
      style={{ borderRadius: size * 0.2 }}
    >
      {/* Background */}
      <rect width={size} height={size} fill={`${color}33`} rx={size * 0.2}/>
      {/* Border */}
      <rect
        x="1" y="1" width={size - 2} height={size - 2}
        fill="none" stroke={`${color}66`} strokeWidth="1.5" rx={size * 0.2 - 1}
      />
      {/* Initials */}
      <text
        x={size / 2} y={size / 2 + fontSize * 0.38}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={color}
        fontFamily="Inter, sans-serif"
      >
        {initials.slice(0, 2)}
      </text>
    </svg>
  );
}
