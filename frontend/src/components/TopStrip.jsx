import React from "react";

// Government strip with utility links
export default function TopStrip() {
  return (
    <div className="w-full bg-gray-200 text-[11px] sm:text-xs text-gray-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between h-8">
        <div className="truncate font-medium">
          GOVERNMENT OF INDIA | MINISTRY OF TRIBAL AFFAIRS
        </div>
        <nav aria-label="Utility" className="hidden sm:flex items-center gap-4 text-gray-700">
          <a href="#main" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 rounded">
            Skip to Main
          </a>
          <a href="#" className="hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 rounded">
            Screen Reader Access
          </a>
          <button title="Contrast" className="w-6 h-6 grid place-items-center rounded-full bg-gray-800 text-white" aria-label="High contrast">
            A
          </button>
          <button title="Font size" className="w-6 h-6 grid place-items-center rounded-full border border-gray-500 text-gray-700" aria-label="Font size">
            A+
          </button>
          <a href="#" className="hover:underline">हिन्दी</a>
        </nav>
      </div>
    </div>
  );
}
