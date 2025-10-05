import React from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import TopStrip from './components/TopStrip'
import BrandingHeader from './components/BrandingHeader'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Mapping from './pages/Mapping'
import OCR from './pages/OCR'
import DSS from './pages/DSS'
import DataCollection from './pages/DataCollection'

function App() {
  const location = useLocation();
  const isMapping = location.pathname.startsWith('/mapping');
  const isDSS = location.pathname.startsWith('/mpp');

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      {/* Utility strip */}
      <TopStrip />

      {/* Moving disclaimer banner (global, above header) */}
      <style>{`
        @keyframes app_home_marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .app-home-marquee { display: inline-block; white-space: nowrap; will-change: transform; animation: app_home_marquee 18s linear infinite; }
      `}</style>
      <div className="w-full bg-red-600 text-white">
        <div className="relative overflow-hidden">
          <div className="app-home-marquee py-2">
            <span className="px-4">
              This website does not belong to any government organization. This Theme is taken only to just show the exact usecase for FRA, SIH2025 by TechnoTuners.
            </span>
          </div>
        </div>
      </div>

      {/* Ministry branding header */}
      <BrandingHeader />

      {/* Primary navigation */}
      <Navbar />

      {/* Main content */}
      <main id="main" className="flex-1 min-h-0 flex">
        <section className={(isMapping || isDSS) ? "relative flex-1 min-h-[400px] w-full overflow-hidden px-0 py-0" : "max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8"}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mapping" element={<Mapping />} />
            <Route path="/mpp" element={<DSS />} />
            <Route path="/ocr" element={<OCR />} />
            <Route path="/datacollection" element={<DataCollection />} />
          </Routes>
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

export default App
