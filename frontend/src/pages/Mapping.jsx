import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

// ArcGIS Service URLs
const STATE_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0';
const DISTRICT_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0';

// State codes mapping
const STATE_CODE = {
  'Odisha': 'OD',
  'Madhya Pradesh': 'MP',
  'Tripura': 'TR',
  'Telangana': 'TG'
};

export default function Mapping() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedVillage, setSelectedVillage] = useState("");
  const [districts, setDistricts] = useState([]);
  
  // Helper function to remove layer and source
  const removeLayerAndSource = (id) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  };

  // Function to highlight state boundary
  const showStateBoundary = async (stateName) => {
    console.log('Showing state boundary for:', stateName);
    const map = mapRef.current;
    if (!map) {
      console.error('Map not initialized');
      return;
    }

    const stateCode = STATE_CODE[stateName];
    if (!stateCode) {
      console.error('Invalid state name:', stateName);
      return;
    }

    const whereByCode = `State_Name='${stateCode}'`;
    const whereByName = `State_FSI='${stateName.replace(/'/g, "''")}'`;
    const urlByCode = `${STATE_SERVICE}/query?where=${encodeURIComponent(whereByCode)}&outFields=*&f=geojson`;
    const urlByName = `${STATE_SERVICE}/query?where=${encodeURIComponent(whereByName)}&outFields=*&f=geojson`;

    try {
      let response = await fetch(urlByCode);
      let data = await response.json();
      
      if (!data || !data.features || data.features.length === 0) {
        response = await fetch(urlByName);
        data = await response.json();
      }

      if (!data || !data.features || data.features.length === 0) {
        throw new Error('No state features found');
      }

      removeLayerAndSource('state-boundary-highlight');
      map.addSource('state-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'state-boundary-highlight',
        type: 'line',
        source: 'state-boundary-highlight',
        paint: {
          'line-color': '#0000ff',
          'line-width': 3
        }
      });

      // Fit to state bounds
      const bounds = data.features[0].geometry.coordinates[0].reduce((bounds, coord) => {
        return [
          [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
          [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
        ];
      }, [[180, 90], [-180, -90]]);

      map.fitBounds(bounds, { padding: 50, duration: 1000 });
    } catch (error) {
      console.error('Error highlighting state:', error);
    }
  };

  // Function to highlight district boundary
  const showDistrictBoundary = async (stateName, districtName) => {
    console.log('Showing district boundary for:', districtName, 'in state:', stateName);
    const map = mapRef.current;
    if (!map) {
      console.error('Map not initialized');
      return;
    }

    const stateCode = STATE_CODE[stateName];
    if (!stateCode) {
      console.error('Invalid state name:', stateName);
      return;
    }

    let where = `state='${stateCode}'`;
    if (districtName) where += ` AND district='${districtName}'`;

    try {
      const response = await fetch(`${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=*&f=geojson`);
      const data = await response.json();

      removeLayerAndSource('district-boundary-highlight');
      map.addSource('district-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'district-boundary-highlight',
        type: 'line',
        source: 'district-boundary-highlight',
        paint: {
          'line-color': '#ffa500',
          'line-width': 2
        }
      });

      if (districtName) {
        // Fit to district bounds if a specific district is selected
        const bounds = data.features[0].geometry.coordinates[0].reduce((bounds, coord) => {
          return [
            [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
            [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
          ];
        }, [[180, 90], [-180, -90]]);

        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }
    } catch (error) {
      console.error('Error highlighting district:', error);
    }
  };
  // Registry of layer groups to control (add new entries here as you add layers)
  const layerGroups = [
    {
      id: "arcgis-features",
      label: "Water Bodies",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle", "-label"],
    },
    {
      id: "district-boundaries",
      label: "District Boundaries",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle", "-label"],
    },
    {
      id: "boundaries-layer",
      label: "State Boundaries",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle", "-label"],
    },
  ];

  // Track which groups are visible
  const [visibleGroups, setVisibleGroups] = useState(() => new Set());

  // Water body state selection (only used when Water Bodies group is visible)
  const [selectedWaterState, setSelectedWaterState] = useState("");
  const waterBodySources = {
    Tripura: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Tripura_water_bodies/FeatureServer/0",
      bounds: [[91.2, 22.8], [92.4, 24.5]] // [southwest, northeast]
    },
    "Madhya Pradesh": {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Madhya_pradesh_water_bodies/FeatureServer/0",
      bounds: [[74.3, 21.2], [82.8, 26.8]]
    },
    Telangana: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Telangana_Water__Bodies/FeatureServer/0",
      bounds: [[77.1, 15.8], [81.3, 19.9]]
    },
    Odisha: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Odisha_water_bodies/FeatureServer/0",
      bounds: [[81.3, 17.7], [87.5, 22.5]]
    }
  };

  // Function to reset view to show all of India
  const resetToIndiaView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [78.9629, 22.5937],
      zoom: 4,
      duration: 1500
    });
  };

  // Helper to remove Water Bodies layers/sources and handle view
  const removeWaterBodiesLayer = () => {
    const map = mapRef.current;
    if (!map) return;
    const baseId = "arcgis-features";
    const sub = ["-fill", "-outline", "-line", "-circle"];
    sub.forEach((s) => {
      const id = `${baseId}${s}`;
      if (map.getLayer(id)) {
        try { map.removeLayer(id); } catch (_) {}
      }
    });
    if (map.getLayer(baseId)) {
      try { map.removeLayer(baseId); } catch (_) {}
    }
    if (map.getSource(baseId)) {
      try { map.removeSource(baseId); } catch (_) {}
    }

    // Reset to India view when removing water bodies layer
    if (!visibleGroups.has("boundaries-layer") && !visibleGroups.has("district-boundaries")) {
      resetToIndiaView();
    }
  };

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

  // Force-hide a group immediately (to avoid brief flash before applyVisibility runs)
  const forceHideGroup = (groupId) => {
    const map = mapRef.current;
    if (!map) return;
    const group = layerGroups.find((g) => g.id === groupId);
    if (!group) return;
    [...(group.sublayers || []), ""].forEach((suffix) => {
      const layerId = `${groupId}${suffix}`;
      if (map.getLayer(layerId)) {
        try { map.setLayoutProperty(layerId, "visibility", "none"); } catch (_) {}
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

    let map;
    try {
      // Clear the container first
      if (mapContainer.current) {
        mapContainer.current.innerHTML = '';
      }

      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: selectedStyle.url,
        center: [78.9629, 22.5937], // Center of India
        zoom: 4, // Zoom level to show all of India
        attributionControl: true,
        minZoom: 3, // Prevent zooming out too far
      });
      mapRef.current = map;

      map.on('error', (e) => {
        console.error('Mapbox GL Error:', e);
        setError('Error loading map: ' + e.error.message);
      });

      map.on('style.load', () => {
        map.resize();
      });

    } catch (err) {
      console.error('Map initialization error:', err);
      setError('Failed to initialize map: ' + err.message);
      return;
    }

    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      // Ensure proper sizing when the container becomes full-bleed
      map.resize();
      try {
        // Load District Boundaries layer (use district_boundary FeatureServer which supports GeoJSON)
        await addArcGISFeatureLayer(map, {
          id: "district-boundaries",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0",
          labelField: "district",
        });
        // Immediately hide unless toggled on, to avoid a flash
        if (!visibleGroups.has("district-boundaries")) forceHideGroup("district-boundaries");
        // Ensure boundaries don't cover thematic layers:
        // use fill-outline-color on the fill layer (polygon outlines render via fill-outline-color)
        if (map.getLayer("district-boundaries-fill")) {
          map.setPaintProperty("district-boundaries-fill", "fill-opacity", 0);
          map.setPaintProperty("district-boundaries-fill", "fill-outline-color", "#000000");
          // Move to top so outline is clearly visible
          try { map.moveLayer("district-boundaries-fill"); } catch (_) {}
        }

        // Load State Boundaries layer (use state_boundary FeatureServer which supports GeoJSON)
        await addArcGISFeatureLayer(map, {
          id: "boundaries-layer",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0",
          labelField: "State_FSI",
        });
        if (!visibleGroups.has("boundaries-layer")) forceHideGroup("boundaries-layer");
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
      const mapInstance = mapRef.current;
      if (mapInstance) {
        try {
          mapInstance.remove();
          mapRef.current = null;
        } catch (err) {
          console.error('Error during map cleanup:', err);
        }
      }
    };
  }, []);

  // When base style changes, update the map style and re-add our custom layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Change style and ensure it loads properly
    map.once('style.load', () => {
      map.resize();
      applyVisibility();
    });
    
    map.setStyle(selectedStyle.url);
    // After style loads, re-add sources/layers and apply visibility
    const onStyleLoad = async () => {
      try {
        // Do not automatically add Water Bodies on style change; handled by selection effect below
        
        // Re-add District Boundaries layer (use district_boundary FeatureServer)
        await addArcGISFeatureLayer(map, {
          id: "district-boundaries",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0",
          labelField: "district",
        });
        // Ensure boundaries don't cover thematic layers (after style reload)
        if (map.getLayer("district-boundaries-fill")) {
          map.setPaintProperty("district-boundaries-fill", "fill-opacity", 0);
          map.setPaintProperty("district-boundaries-fill", "fill-outline-color", "#000000");
          // Move to top so outline is clearly visible
          try { map.moveLayer("district-boundaries-fill"); } catch (_) {}
        }

        // Re-add State Boundaries layer (use state_boundary FeatureServer)
        await addArcGISFeatureLayer(map, {
          id: "boundaries-layer",
          featureServerUrl: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0",
          labelField: "State_FSI",
        });
        if (map.getLayer("boundaries-layer-fill")) {
          map.setPaintProperty("boundaries-layer-fill", "fill-opacity", 0);
          map.setPaintProperty("boundaries-layer-fill", "fill-outline-color", "#000000");
          try { map.moveLayer("boundaries-layer-fill"); } catch (_) {}
        }
        // If Water Bodies group is visible and a state is chosen, re-add it after style change
        if (visibleGroups.has("arcgis-features") && selectedWaterState && waterBodySources[selectedWaterState]) {
          await addArcGISFeatureLayer(map, {
            id: "arcgis-features",
            featureServerUrl: waterBodySources[selectedWaterState],
            fit: false,
          });
          if (map.getLayer("arcgis-features-fill")) {
            map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
            map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
          }
          if (map.getLayer("arcgis-features-outline")) {
            map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
            map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
          }
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

  // Fetch districts when state is selected
  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      removeLayerAndSource('state-boundary-highlight');
      removeLayerAndSource('district-boundary-highlight');
      return;
    }

    console.log('Fetching districts for state:', selectedState);
    const stateCode = STATE_CODE[selectedState];
    const where = `state='${stateCode}'`;
    const url = `${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=district&returnDistinctValues=true&returnGeometry=false&f=json`;

    fetch(url)
      .then(res => res.json())
      .then(json => {
        console.log('Districts response:', json);
        const districtList = (json.features || [])
          .map(f => (f.attributes && (f.attributes.district || f.attributes.District)))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        console.log('Processed district list:', districtList);
        setDistricts(districtList);
      })
      .catch(err => {
        console.error('Failed to load districts:', err);
        setDistricts([]);
      });

    // Highlight state boundary when state is selected
    showStateBoundary(selectedState);
  }, [selectedState]);

  // Handle district selection changes
  useEffect(() => {
    if (!selectedState || !selectedDistrict) {
      removeLayerAndSource('district-boundary-highlight');
      return;
    }

    console.log('Highlighting district:', selectedDistrict, 'in state:', selectedState);
    showDistrictBoundary(selectedState, selectedDistrict);
  }, [selectedState, selectedDistrict]);

  // Load or remove Water Bodies based on visibility + selected state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    const handleWaterBodies = async () => {
      try {
        const visible = visibleGroups.has("arcgis-features");
        
        // If layer is not visible or no state is selected, remove the layer
        if (!visible || !selectedWaterState || !waterBodySources[selectedWaterState]) {
          removeWaterBodiesLayer();
          if (!visible) resetToIndiaView();
          return;
        }

        // Wait for style to be loaded
        if (!map.isStyleLoaded()) {
          await new Promise(resolve => map.once('style.load', resolve));
        }

        // Remove any existing water bodies layer
        removeWaterBodiesLayer();

        // Add new water bodies layer
        await addArcGISFeatureLayer(map, {
          id: "arcgis-features",
          featureServerUrl: waterBodySources[selectedWaterState].url,
          fit: false,
        });

        // Style the layers
        if (map.getLayer("arcgis-features-fill")) {
          map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
          map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
        }
        if (map.getLayer("arcgis-features-outline")) {
          map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
          map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
        }

        // Zoom to state bounds
        const stateBounds = waterBodySources[selectedWaterState].bounds;
        if (stateBounds) {
          map.fitBounds(stateBounds, {
            padding: 50,
            duration: 1500
          });
        }
      } catch (e) {
        console.error('Error handling water bodies layer:', e);
        setError('Failed to load water bodies: ' + e.message);
      }
    };

    handleWaterBodies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups, selectedWaterState]);

  return (
    <div className="relative h-screen w-full overflow-hidden">
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
      <div 
        ref={mapContainer} 
        className="absolute inset-0 w-full h-full bg-gray-100"
        style={{ minHeight: '400px' }} 
      />

      {/* Top-right Base Map Style Selector */}
      <div className="absolute right-3 top-3 z-10">
        <div className="bg-white/90 hover:bg-white/80 active:bg-white/70 transition-all duration-200 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2">
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

      {/* Left-top controls */}
      <div className="absolute left-3 top-16 z-10">
        <div className="flex flex-col gap-2">
          {/* Layers section - horizontal */}
          <div className="bg-white/60 hover:bg-white/90 transition-all duration-300 backdrop-blur rounded-lg shadow border border-gray-200 px-2 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-2">
              Layers
            </div>
            <div className="flex flex-row gap-4">
              {layerGroups.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer whitespace-nowrap"
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

          {/* Search section */}
          <div className="bg-white/60 hover:bg-white/90 transition-all duration-300 backdrop-blur rounded-lg shadow border border-gray-200 px-2 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-2">
              Search Location
            </div>
            <div className="flex flex-row gap-2">
              <select
                className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/75 hover:bg-white/90 transition-colors duration-200 min-w-[100px]"
                value={selectedState}
                onChange={(e) => {
                  console.log('State selected:', e.target.value);
                  const newState = e.target.value;
                  setSelectedState(newState);
                  setSelectedDistrict("");
                  setSelectedVillage("");
                  removeLayerAndSource('district-boundary-highlight');
                  if (!newState) {
                    removeLayerAndSource('state-boundary-highlight');
                  }
                }}
              >
                <option value="">Select State</option>
                {Object.keys(STATE_CODE).map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>

              <select
                className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/75 hover:bg-white/90 transition-colors duration-200 min-w-[100px]"
                value={selectedDistrict}
                onChange={(e) => {
                  console.log('District selected:', e.target.value);
                  const newDistrict = e.target.value;
                  setSelectedDistrict(newDistrict);
                  setSelectedVillage("");
                }}
                disabled={!selectedState}
              >
                <option value="">Select District</option>
                {districts.map(district => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>

              <select
                className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/75 hover:bg-white/90 transition-colors duration-200 min-w-[100px]"
                value={selectedVillage}
                onChange={(e) => setSelectedVillage(e.target.value)}
                disabled={!selectedDistrict}
              >
                <option value="">Select Village</option>
                {/* Village options will be added when you provide the logic */}
              </select>
            </div>
          </div>

          {/* Conditional Water Bodies state dropdown */}
          {visibleGroups.has("arcgis-features") && (
            <div className="bg-white/60 hover:bg-white/90 transition-all duration-300 backdrop-blur rounded-lg shadow border border-gray-200 px-2 py-2 mt-2">
              <label className="block text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-1">
                Water Body State
              </label>
              <select
                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/90"
                value={selectedWaterState}
                onChange={(e) => {
                  setSelectedWaterState(e.target.value);
                  const stateBounds = e.target.value ? waterBodySources[e.target.value]?.bounds : null;
                  if (stateBounds) {
                    mapRef.current?.fitBounds(stateBounds, {
                      padding: 50,
                      duration: 1500
                    });
                  } else {
                    resetToIndiaView();
                  }
                }}
              >
                <option value="">Select a state</option>
                {Object.keys(waterBodySources).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
