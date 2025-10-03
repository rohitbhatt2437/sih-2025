import React, { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navItemClass =
    "px-3 py-2 text-sm text-white/90 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/60 rounded";

  return (
    <nav className="bg-[#0B5FA5] text-white" aria-label="Primary">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-12">
          <button
            className="sm:hidden p-2 -ml-2"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block w-6 h-0.5 bg-white mb-1"></span>
            <span className="block w-6 h-0.5 bg-white mb-1"></span>
            <span className="block w-6 h-0.5 bg-white"></span>
          </button>

          <ul className="hidden sm:flex items-center gap-2">
            <li>
              <Link to="/" className={navItemClass}>
                Home
              </Link>
            </li>
            
            <li><Link to="/mapping" className={navItemClass}>Mapping</Link></li>
            <li><Link to="/ocr" className={navItemClass}>Scan documents</Link></li>
            <li><Link to="/datacollection" className={navItemClass}>Data Collection</Link></li>
            <li><Link to="/mpp" className={navItemClass}>MPP</Link></li>
          </ul>
        </div>

        {open && (
          <div className="sm:hidden pb-2">
            <Link to="/" className="block py-2 text-sm" onClick={() => setOpen(false)}>Home</Link>
            <button
              className="block w-full text-left py-2 text-sm"
              onClick={() => setDropdownOpen((v) => !v)}
            >
              Wetland Authority Delhi
            </button>
            {dropdownOpen && (
              <div className="ml-3 border-l border-white/30 pl-3 space-y-1">
                <a href="#" className="block py-1 text-sm">About WAD</a>
                <a href="#" className="block py-1 text-sm">Guidelines</a>
                <a href="#" className="block py-1 text-sm">Contact</a>
              </div>
            )}
            <Link to="/mapping" className="block py-2 text-sm" onClick={() => setOpen(false)}>Mapping</Link>
            <Link to="/ocr" className="block py-2 text-sm" onClick={() => setOpen(false)}>OCR</Link>
            <a href="#" className="block py-2 text-sm">Sensor Data</a>
            <a href="#" className="block py-2 text-sm">Upload Recent Image</a>
            <a href="#" className="block py-2 text-sm">Water Quality Map</a>
            <a href="#" className="block py-2 text-sm">Vegetation Map</a>
          </div>
        )}
      </div>
    </nav>
  );
}
