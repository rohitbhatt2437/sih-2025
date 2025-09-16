import React from "react";

// Minimal, dependency-free bar chart using SVG
export default function OverviewBarChart({ data = [], maxValue = 100, title = "Overview" }) {
  const barWidth = 48;
  const gap = 36;
  const chartHeight = 160;
  const chartWidth = data.length * (barWidth + gap) + gap;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight + 40} role="img" aria-label={`${title} bar chart`}>
          {/* Y-axis gridlines */}
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line
                x1={0}
                y1={(1 - p / 100) * chartHeight}
                x2={chartWidth}
                y2={(1 - p / 100) * chartHeight}
                stroke="#e5e7eb"
              />
              <text
                x={0}
                y={(1 - p / 100) * chartHeight - 4}
                fontSize="10"
                fill="#6b7280"
              >
                {Math.round((p * maxValue) / 100)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = gap + i * (barWidth + gap);
            const height = (d.value / maxValue) * chartHeight;
            const y = chartHeight - height;
            return (
              <g key={d.label}>
                <rect x={x} y={y} width={barWidth} height={height} fill="#0b2962" rx="6" />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 16}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#6b7280"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
