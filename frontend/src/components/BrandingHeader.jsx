import React from "react";
import ministryLogo from "../images/ministry_logo.jpg";
import swachhBharat from "../images/swachh_bharat.jpg";

export default function BrandingHeader() {
  return (
    <header className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 md:py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src={ministryLogo}
            alt="Ministry of Tribal Affairs - Government of India"
            className="h-16 sm:h-20 md:h-24 w-auto shrink-0 object-contain"
          />
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src={swachhBharat}
            alt="Swachh Bharat"
            className="h-16 sm:h-20 md:h-24 w-auto shrink-0 object-contain"
          />
        </div>
      </div>
    </header>
  );
}
