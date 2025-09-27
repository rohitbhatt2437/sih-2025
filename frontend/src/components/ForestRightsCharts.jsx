import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function ForestRightsCharts({ stateData }) {
  // Common chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  // Individual Forest Rights chart data
  const ifrChartData = {
    labels: [stateData.state || 'Selected State'],
    datasets: [
      {
        label: 'IFR Claims Received',
        data: [stateData.ifrClaimsReceived],
        backgroundColor: 'rgba(255, 206, 86, 0.5)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 1,
      },
      {
        label: 'IFR Titles Distributed',
        data: [stateData.ifrTitlesDistributed],
        backgroundColor: 'rgba(255, 159, 64, 0.5)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Community Forest Rights chart data
  const cfrChartData = {
    labels: [stateData.state || 'Selected State'],
    datasets: [
      {
        label: 'CFR Claims Received',
        data: [stateData.cfrClaimsReceived],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
      {
        label: 'CFR Titles Distributed',
        data: [stateData.cfrTitlesDistributed],
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Forest Land Recognition chart data
  const forestLandChartData = {
    labels: [stateData.state || 'Selected State'],
    datasets: [
      {
        label: 'IFR Forest Land',
        data: [stateData.ifrForestLand],
        backgroundColor: 'rgba(255, 206, 86, 0.5)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 1,
      },
      {
        label: 'CFR Forest Land',
        data: [stateData.cfrForestLand],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Claims Status chart data
  const claimsStatusData = {
    labels: ['Claims Status'],
    datasets: [
      {
        label: 'Total Titles Distributed',
        data: [stateData.totalTitlesDistributed],
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
      {
        label: 'Pending Claims',
        data: [stateData.pendingClaims],
        backgroundColor: 'rgba(153, 102, 255, 0.5)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1,
      },
      {
        label: 'Rejected Claims',
        data: [stateData.rejectedClaims],
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Individual Forest Rights Chart */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">Status of Individual Forest Rights</h3>
        <div className="h-[260px]">
          <Bar options={chartOptions} data={ifrChartData} />
        </div>
      </div>

      {/* Community Forest Rights Chart */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">Status of Community Forest Rights</h3>
        <div className="h-[260px]">
          <Bar options={chartOptions} data={cfrChartData} />
        </div>
      </div>

      {/* Forest Land Recognition Chart */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">State-Wise Forest Land Recognised</h3>
        <div className="h-[260px]">
          <Bar options={chartOptions} data={forestLandChartData} />
        </div>
      </div>

      {/* Claims Status Chart */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-3">Claims Status</h3>
        <div className="h-[260px]">
          <Bar options={chartOptions} data={claimsStatusData} />
        </div>
      </div>
    </div>
  );
}