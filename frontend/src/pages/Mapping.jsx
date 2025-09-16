import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

export default function Mapping() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      setError(
        "Missing VITE_MAPBOX_TOKEN. Create a .env file (see .env.example) with your Mapbox access token."
      );
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [77.209, 28.6139], // Delhi approx
      zoom: 9,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      // Ensure proper sizing when the container becomes full-bleed
      map.resize();
      // Load ArcGIS FeatureServer as GeoJSON
      const featureServerUrl =
        "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/WFSServer_(4)/FeatureServer/0";
      try {
        await addArcGISFeatureLayer(map, {
          id: "arcgis-features",
          featureServerUrl,
        });
      } catch (e) {
        console.error(e);
        setError(
          "Failed to load ArcGIS layer. Check console for details or CORS issues."
        );
      }
    });

    // Keep map sized to container changes
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainer.current) ro.observe(mapContainer.current);

    // Safety: also resize after a short delay (layout settles)
    const t = setTimeout(() => map.resize(), 300);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div className="relative h-full">
      {/* Overlay header and error, non-blocking */}
      <div className="absolute top-3 left-3 z-10">
        <h1 className="text-base sm:text-lg font-semibold text-white drop-shadow">Mapping</h1>
        {error && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/95 text-amber-900 p-2 text-xs max-w-sm">
            {error}
          </div>
        )}
      </div>

      {/* Full-bleed map fills the space between header and footer */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
