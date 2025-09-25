import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

export default function Mapping() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);
  // Registry of layer groups to control (add new entries here as you add layers)
  const layerGroups = [
    {
      id: "arcgis-features",
      label: "Water Bodies",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle"],
    },
    {
      id: "district-boundaries",
      label: "District Boundaries",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle"],
    },
    {
      id: "boundaries-layer",
      label: "Boundaries",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle"],
    },
  ];

  // Track which groups are visible
  const [visibleGroups, setVisibleGroups] = useState(() => new Set());

  // Base map styles
  const styles = [
    { key: "streets", label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
    { key: "satellite", label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  ];
  const [selectedStyle, setSelectedStyle] = useState(styles[0]);

  // Helper to apply current visibility to map layers
  const applyVisibility = () => {
    const map = mapRef.current;
    if (!map) return;
    layerGroups.forEach((group) => {
      const isVisible = visibleGroups.has(group.id);
      // Toggle potential sublayers (if they exist)
      group.sublayers.forEach((suffix) => {
        const layerId = `${group.id}${suffix}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            isVisible ? "visible" : "none"
          );
        }
      });
      // Also toggle a base layer with the same id (e.g., raster tiles), if present
      if (map.getLayer(group.id)) {
        map.setLayoutProperty(
          group.id,
          "visibility",
          isVisible ? "visible" : "none"
        );
      }
    });
  };

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
      style: selectedStyle.url,
      center: [78.56, 25.45], // Jhansi approx (lng, lat)
      zoom: 10,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      // Ensure proper sizing when the container becomes full-bleed
      map.resize();
      try {
        // Load Water Bodies layer
        await addArcGISFeatureLayer(map, {
          id: "arcgis-features",
          featureServerUrl: "https://livingatlas.esri.in/server1/rest/services/Water/Surface_Water_Bodies/MapServer/0",
        });
        // Darken water bodies style
        if (map.getLayer("arcgis-features-fill")) {
          map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
          map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
        }
        if (map.getLayer("arcgis-features-outline")) {
          map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
          map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
        }

        // Load District Boundaries layer
        await addArcGISFeatureLayer(map, {
          id: "district-boundaries",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/WFSServer_(7)/FeatureServer/0"
        });
        // Ensure boundaries don't cover thematic layers:
        // use fill-outline-color on the fill layer (polygon outlines render via fill-outline-color)
        if (map.getLayer("district-boundaries-fill")) {
          map.setPaintProperty("district-boundaries-fill", "fill-opacity", 0);
          map.setPaintProperty("district-boundaries-fill", "fill-outline-color", "#000000");
          // Move to top so outline is clearly visible
          try { map.moveLayer("district-boundaries-fill"); } catch (_) {}
        }

        // Load original Boundaries layer
        await addArcGISFeatureLayer(map, {
          id: "boundaries-layer",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/WFSServer/FeatureServer/0",
        });
        if (map.getLayer("boundaries-layer-fill")) {
          map.setPaintProperty("boundaries-layer-fill", "fill-opacity", 0);
          map.setPaintProperty("boundaries-layer-fill", "fill-outline-color", "#000000");
          try { map.moveLayer("boundaries-layer-fill"); } catch (_) {}
        }
        
        // Apply current visibility preferences once layers are added
        applyVisibility();
      } catch (e) {
        console.error(e);
        setError(
          "Failed to load map layers. Check console for details or CORS issues."
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

  // When base style changes, update the map style and re-add our custom layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Change style
    map.setStyle(selectedStyle.url);
    // After style loads, re-add sources/layers and apply visibility
    const onStyleLoad = async () => {
      try {
        // Re-add Water Bodies layer
        await addArcGISFeatureLayer(map, {
          id: "arcgis-features",
          featureServerUrl: "https://livingatlas.esri.in/server1/rest/services/Water/Surface_Water_Bodies/MapServer/0",
        });
        // Apply water bodies style after style reload
        if (map.getLayer("arcgis-features-fill")) {
          map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
          map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
        }
        if (map.getLayer("arcgis-features-outline")) {
          map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
          map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
        }
        
        // Re-add District Boundaries layer
        await addArcGISFeatureLayer(map, {
          id: "district-boundaries",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/WFSServer_(7)/FeatureServer/0"
        });
        // Ensure boundaries don't cover thematic layers (after style reload)
        if (map.getLayer("district-boundaries-fill")) {
          map.setPaintProperty("district-boundaries-fill", "fill-opacity", 0);
          map.setPaintProperty("district-boundaries-fill", "fill-outline-color", "#000000");
          // Move to top so outline is clearly visible
          try { map.moveLayer("district-boundaries-fill"); } catch (_) {}
        }

        // Re-add original Boundaries layer
        await addArcGISFeatureLayer(map, {
          id: "boundaries-layer",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/WFSServer/FeatureServer/0",
        });
        if (map.getLayer("boundaries-layer-fill")) {
          map.setPaintProperty("boundaries-layer-fill", "fill-opacity", 0);
          map.setPaintProperty("boundaries-layer-fill", "fill-outline-color", "#000000");
          try { map.moveLayer("boundaries-layer-fill"); } catch (_) {}
        }
      } catch (e) {
        console.error(e);
      }
      applyVisibility();
    };
    map.once("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStyle]);

  // Re-apply visibility any time the toggles change
  useEffect(() => {
    applyVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups]);

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

      {/* Top-right Base Map Style Selector */}
      <div className="absolute right-3 top-3 z-10">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2">
          <label className="block text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-1">
            Base Map
          </label>
          <select
            className="text-sm px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/90"
            value={selectedStyle.key}
            onChange={(e) => {
              const next = styles.find((s) => s.key === e.target.value);
              if (next) setSelectedStyle(next);
            }}
          >
            {styles.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bottom-left layer toggles (positioned above ScaleControl to avoid overlap) */}
      <div className="absolute left-3 bottom-16 z-10">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2 min-w-[160px]">
          <div className="text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-1">
            Layers
          </div>
          <div className="space-y-1">
            {layerGroups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={visibleGroups.has(g.id)}
                  onChange={(e) =>
                    setVisibleGroups((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(g.id);
                      else next.delete(g.id);
                      return next;
                    })
                  }
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
