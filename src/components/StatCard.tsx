"use client";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon?: React.ReactNode;
  loading?: boolean;
  /** value 숫자에 얹을 색상 클래스 (예: 손익 초록/빨강) */
  valueClass?: string;
}

export default function StatCard({
  title,
  value,
  subtitle,
  change,
  icon,
  loading,
  valueClass,
}: StatCardProps) {
  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-3 md:p-5 glow-hover">
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <span className="text-[10px] md:text-[11px] font-medium text-hl-text-tertiary uppercase tracking-wider">
          {title}
        </span>
        {icon && <span className="text-hl-text-tertiary">{icon}</span>}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-6 md:h-7 w-24 md:w-32" />
          <div className="skeleton h-3 md:h-4 w-16 md:w-20" />
        </div>
      ) : (
        <>
          <div className={`text-lg md:text-2xl font-semibold font-mono tracking-tight ${valueClass ?? "text-hl-text-primary"}`}>
            {value}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {change !== undefined && (
              <span
                className={`text-xs font-medium ${
                  change >= 0 ? "text-hl-green" : "text-hl-red"
                }`}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
            {subtitle && (
              <span className="text-[10px] md:text-xs text-hl-text-tertiary">{subtitle}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
