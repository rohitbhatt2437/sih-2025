import React from "react";
import StatCard from "../components/StatCard";
import OverviewBarChart from "../components/OverviewBarChart";

export default function Home() {
  const stats = [
    { title: "Total Water Bodies", value: "1,012" },
    { title: "Monitored Water Bodies", value: "750" },
    { title: "Under Maintenance", value: "12" },
    { title: "High Pollution Areas", value: "432" },
    { title: "Potential Diseases", value: "175" },
    { title: "Wildlife Sightings", value: "68" },
    { title: "Near Agricultural Land", value: "81" },
    { title: "Total Funding", value: "₹30,000" },
  ];

  const chartData = [
    { label: "Fenced Bodies", value: 80 },
    { label: "Initiatives", value: 60 },
    { label: "Disease Outbreak", value: 30 },
    { label: "Oxygen Levels", value: 70 },
    { label: "Cleaning Activities", value: 50 },
    { label: "Water Bodies Monitored", value: 90 },
  ];

  const maxValue = 100; // for simple 0-100 visualization

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Monitored Data</h2>

      {/* Stat Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.title} title={s.title} value={s.value} />
        ))}
      </div>

      {/* Overview chart */}
      <div>
        <OverviewBarChart title="Overview" data={chartData} maxValue={maxValue} />
      </div>
    </div>
  );
}
