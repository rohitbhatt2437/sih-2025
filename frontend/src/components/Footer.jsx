import React from "react";

export default function Footer() {
  return (
    <footer className="mt-8">
      {/* Top policy links bar */}
      <div className="bg-[#0B5FA5]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <ul className="flex flex-wrap items-center gap-3 sm:gap-5 text-white text-xs sm:text-sm py-2">
            <li><a href="#" className="hover:underline">Public Grievances</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">RTI</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Website Policy</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Copyright Policy</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">FAQ</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Related Websites</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Tenders, Vacancies & Advertisement</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Web Information Manager</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Feedback</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Disclaimer</a></li>
            <li className="opacity-60">|</li>
            <li><a href="#" className="hover:underline">Help</a></li>
          </ul>
        </div>
      </div>

      {/* Info row */}
      <div className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-gray-700">
          <div className="space-y-1">
            <p>
              Website Content Owned by <span className="font-medium">Ministry of Tribal Affairs, Government of India</span>
            </p>
            <p>
              Designed, Developed and Hosted by <span className="font-medium">National Informatics Centre (NIC)</span>
            </p>
            <p>Last Updated: <time dateTime="2025-09-16">16 Sep 2025</time></p>
          </div>

          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="font-medium mb-1">Follow Us</p>
              <div className="flex items-center gap-2">
                <a aria-label="Instagram" href="#" className="w-8 h-8 grid place-items-center rounded-full bg-pink-600 text-white">I</a>
                <a aria-label="X" href="#" className="w-8 h-8 grid place-items-center rounded-full bg-black text-white">X</a>
                <a aria-label="YouTube" href="#" className="w-8 h-8 grid place-items-center rounded-full bg-red-600 text-white">▶</a>
                <a aria-label="Facebook" href="#" className="w-8 h-8 grid place-items-center rounded-full bg-blue-600 text-white">f</a>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Visitor Count</p>
              <span className="inline-block bg-black text-white px-2 py-1 rounded text-sm">11242796</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
