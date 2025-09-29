import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

// ArcGIS Service URLs
const STATE_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0';
const DISTRICT_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0';
const VILLAGE_SERVICE = 'https://livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024/MapServer/0';

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
  const [showDistricts, setShowDistricts] = useState(false);
  // State for districts and villages dropdowns
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  
  // Helper function to remove layer and source
  const removeLayerAndSource = (id) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  };

  // Minimal helper to highlight selected district boundary
  const showDistrictBoundary = async (stateName, districtName) => {
    const map = mapRef.current;
    if (!map || !stateName || !districtName) return;
    const stateCode = STATE_CODE[stateName];
    if (!stateCode) return;
    try {
      const where = `state='${stateCode}' AND UPPER(district)='${String(districtName).toUpperCase().replace(/'/g, "''")}'`;
      const url = `${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=*&f=geojson`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data || !data.features || data.features.length === 0) return;
      // Refresh highlight source/layer
      removeLayerAndSource('district-boundary-highlight');
      map.addSource('district-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'district-boundary-highlight',
        type: 'line',
        source: 'district-boundary-highlight',
        paint: {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });
    } catch (e) {
      console.error('Failed to show district boundary:', e);
    }
  };

  // Helper to remove a layer group that may have sublayers created by addArcGISFeatureLayer
  const removeLayerGroup = (baseId) => {
    const map = mapRef.current;
    if (!map) return;
    const subs = ["-fill", "-outline", "-line", "-circle", "-label"]; 
    subs.forEach((s) => {
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

  // Load water bodies for the selected area (state/district/village)
  const loadWaterBodies = async (stateName, districtName, villageName) => {
    const map = mapRef.current;
    if (!map) return;

    // Wait for map style to be loaded
    if (!map.isStyleLoaded()) {
      await new Promise(resolve => map.once('style.load', resolve));
    }

    const stateCode = STATE_CODE[stateName];
    if (!stateCode) {
      console.error('Invalid state name:', stateName);
      return;
    }

    // Get the water bodies service URL for the selected state
    const waterServiceUrl = waterBodySources[stateName]?.url;
    if (!waterServiceUrl) {
      console.error('No water bodies service available for state:', stateName);
      return;
    }

    try {
      // Build the where clause based on hierarchy
      const parts = [`state='${stateCode}'`];
      if (districtName) {
        parts.push(`UPPER(district)=UPPER('${String(districtName).replace(/'/g, "''")}')`);
      }
      if (villageName) {
        parts.push(`UPPER(village)=UPPER('${String(villageName).replace(/'/g, "''")}')`);
      }
      const where = parts.join(' AND ');

      // Remove existing layers first (ensure sublayers removed before source)
      removeWaterBodiesLayer();

      const params = new URLSearchParams({
        where,
        outFields: '*',
        f: 'geojson'
      });

      const response = await fetch(`${waterServiceUrl}/query?${params}`);
      const data = await response.json();

      if (!data?.features) {
        throw new Error('No features returned from water bodies service');
      }

      // Add water bodies to map
      map.addSource('arcgis-features', {
        type: 'geojson',
        data
      });

      // Add fill layer
      map.addLayer({
        id: 'arcgis-features-fill',
        type: 'fill',
        source: 'arcgis-features',
        paint: {
          'fill-color': '#1976d2',
          'fill-opacity': 0.55
        }
      });

      // Add outline layer
      map.addLayer({
        id: 'arcgis-features-outline',
        type: 'line',
        source: 'arcgis-features',
        paint: {
          'line-color': '#1976d2',
          'line-width': 1
        }
      });

      return data;
    } catch (error) {
      console.error('Error loading water bodies:', error);
      removeLayerAndSource('arcgis-features');
      return null;
    }
  };  // Function to load villages for a district
  const loadVillagesForDistrict = async (stateName, districtName) => {
    console.log('Loading villages for:', stateName, districtName); // Debug log
    if (!stateName || !districtName) {
      setVillages([]);
      return;
    }

    try {
      // Case-insensitive WHERE clause
      const where = [
        `UPPER(State)=UPPER('${stateName}')`,
        `UPPER(District)=UPPER('${districtName}')`
      ].join(' AND ');

      // Use statistics + groupBy for true distincts
      const stats = JSON.stringify([
        { statisticType: 'count', onStatisticField: 'Name', outStatisticFieldName: 'cnt' }
      ]);

      const pageSize = 2000;
      let resultOffset = 0;
      let villages = new Set();

      while (true) {
        const params = new URLSearchParams({
          where,
          outFields: 'Name',
          groupByFieldsForStatistics: 'Name',
          outStatistics: stats,
          orderByFields: 'Name',
          returnGeometry: 'false',
          f: 'json',
          resultOffset: String(resultOffset),
          resultRecordCount: String(pageSize)
        });

        const url = `${VILLAGE_SERVICE}/query?${params}`;
        console.log('Fetching villages URL:', url); // Debug log

        const response = await fetch(url);
        const data = await response.json();

        console.log('Village data received:', data); // Debug log

        if (data.error) {
          throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
        }

        if (!data || !Array.isArray(data.features)) {
          console.log('No valid features returned:', data);
          return;
        }

        data.features.forEach(feature => {
          if (feature && feature.attributes) {
            const name = feature.attributes.Name || feature.attributes.name;
            if (name && typeof name === 'string') {
              villages.add(name.trim());
            }
          }
        });

        // If server signals more data, continue paging
        if (data.exceededTransferLimit && data.features.length > 0) {
          resultOffset += data.features.length;
        } else {
          break;
        }
      }

      const villageList = [...villages].sort((a, b) => a.localeCompare(b));
      console.log('Final village list:', villageList); // Debug log
      setVillages(villageList);

    } catch (error) {
      console.error('Failed to load villages:', error);
      setVillages([]);
    }
  };

  // (Removed) effect and UI for state boundaries visibility toggle

  // Effect to load villages when district changes
  useEffect(() => {
    console.log('District selection changed:', selectedState, selectedDistrict); // Debug log
    if (!selectedState || !selectedDistrict) {
      setVillages([]);
      return;
    }

    // Load villages with error handling
    loadVillagesForDistrict(selectedState, selectedDistrict).catch(error => {
      console.error('Failed to load villages:', error);
      setVillages([]);
    });
  }, [selectedState, selectedDistrict]);

  // Function to show village boundary
  const showVillageBoundary = async (stateName, districtName, villageName) => {
    const map = mapRef.current;
    if (!map) {
      console.error('Map not initialized');
      return;
    }

    // Remove any existing village boundary
    removeLayerAndSource('village-boundary-highlight');

    if (!villageName) return;

    try {
      const parts = [
        `State='${stateName}'`,
        `District='${districtName}'`,
        `Name='${villageName}'`
      ];
      const where = parts.join(' AND ');

      const params = new URLSearchParams({
        where,
        outFields: '*',
        f: 'geojson'
      });

      const response = await fetch(`${VILLAGE_SERVICE}/query?${params}`);
      const data = await response.json();

      if (!data?.features?.length) {
        console.error('No village boundary found');
        return;
      }

      // Add village boundary to map
      map.addSource('village-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'village-boundary-highlight',
        type: 'line',
        source: 'village-boundary-highlight',
        paint: {
          'line-color': '#F07857', // Red color for village boundary
          'line-width': 3
        }
      });

      // Fit to village bounds
      const bounds = data.features[0].geometry.coordinates[0].reduce((bounds, coord) => {
        return [
          [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
          [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
        ];
      }, [[180, 90], [-180, -90]]);

      map.fitBounds(bounds, { padding: 50, duration: 1000 });
    } catch (error) {
      console.error('Error showing village boundary:', error);
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
    // Note: District and State boundaries are not auto-added anymore
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
    if (!visibleGroups.has("boundaries-layer")) {
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

  // Fetch districts and water bodies when state is selected
  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      removeLayerAndSource('state-boundary-highlight');
      removeLayerAndSource('district-boundary-highlight');
      removeLayerAndSource('arcgis-features');
      return;
    }

    console.log('Fetching districts for state:', selectedState);
    const stateCode = STATE_CODE[selectedState];
    const where = `state='${stateCode}'`;
    const url = `${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=district&returnDistinctValues=true&returnGeometry=false&f=json`;

    // Load water bodies for the selected state
    if (visibleGroups.has("arcgis-features")) {
      loadWaterBodies(selectedState);
    }

    // Fetch districts for the selected state
    fetch(url)
      .then(res => res.json())
      .then(json => {
        console.log('Districts response:', json);
        const districtList = (json.features || [])
          .map(f => {
            if (!f || !f.attributes) return null;
            return f.attributes.district || f.attributes.District;
          })
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
  }, [selectedState, visibleGroups]);

  // Handle district selection changes
  useEffect(() => {
    if (!selectedState || !selectedDistrict) {
      removeLayerAndSource('district-boundary-highlight');
      if (!selectedState) {
        removeLayerAndSource('arcgis-features');
      }
      return;
    }

    // Show red boundary for selected district
    showDistrictBoundary(selectedState, selectedDistrict);

    // Load water bodies for the selected district
    if (visibleGroups.has("arcgis-features")) {
      loadWaterBodies(selectedState, selectedDistrict);
    }
  }, [selectedState, selectedDistrict, visibleGroups]);

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

  // Toggle the on-demand Districts layer from DISTRICT_SERVICE
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const baseId = "toggle-districts";
    const addOrRemove = async () => {
      try {
        if (!showDistricts) {
          removeLayerGroup(baseId);
          return;
        }

        // Wait for style
        if (!map.isStyleLoaded()) {
          await new Promise((resolve) => map.once('style.load', resolve));
        }

        // Remove any existing before adding fresh
        removeLayerGroup(baseId);

        // Optional: filter to selected state if available
        let where;
        if (selectedState) {
          const code = STATE_CODE[selectedState];
          if (code) {
            const codes = selectedState === 'Telangana' ? ["TS", "TG"] : [code];
            const esc = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
            where = `state IN (${esc})`;
          }
        }

        await addArcGISFeatureLayer(map, {
          id: baseId,
          featureServerUrl: DISTRICT_SERVICE,
          where,
          fit: false,
        });

        // Style: hide fill, thin light-brown outline
        if (map.getLayer(`${baseId}-fill`)) {
          try { map.setPaintProperty(`${baseId}-fill`, 'fill-opacity', 0); } catch (_) {}
        }
        if (map.getLayer(`${baseId}-line`)) {
          try {
            map.setPaintProperty(`${baseId}-line`, 'line-color', '#8B4513');
            map.setPaintProperty(`${baseId}-line`, 'line-width', 0.2);
          } catch (_) {}
        }
        if (map.getLayer(`${baseId}-outline`)) {
          // Some geometries may create outline instead of line
          try {
            map.setPaintProperty(`${baseId}-outline`, 'line-color', '#8B4513');
            map.setPaintProperty(`${baseId}-outline`, 'line-width', 0.2);
          } catch (_) {}
        }
      } catch (e) {
        console.error('Failed to toggle districts layer:', e);
      }
    };

    addOrRemove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDistricts, selectedState]);

  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col">
      {/* Top Navigation Bar */}
      <div className="w-full bg-white shadow-md z-20">
        <div className="container mx-auto px-4 py-3">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-6 border-b border-gray-200">
            {/* Location Selection */}
            <div className="flex-1 -mb-px">
              <div className="flex items-center gap-4">
                <select
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedState}
                  onChange={(e) => {
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
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedDistrict}
                  onChange={(e) => {
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
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedVillage}
                  onChange={(e) => {
                    const newVillage = e.target.value;
                    setSelectedVillage(newVillage);
                    if (newVillage) {
                      showVillageBoundary(selectedState, selectedDistrict, newVillage);
                    } else {
                      removeLayerAndSource('village-boundary-highlight');
                    }
                    if (visibleGroups.has("arcgis-features")) {
                      loadWaterBodies(selectedState, selectedDistrict, newVillage);
                    }
                  }}
                  disabled={!selectedDistrict}
                >
                  <option value="">-- All Villages --</option>
                  {villages.map(village => (
                    <option key={village} value={village}>{village}</option>
                  ))}
                </select>

                {/* Show Districts toggle (on-demand districts overlay) */}
                <label className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={showDistricts}
                    onChange={(e) => setShowDistricts(e.target.checked)}
                  />
                  <span>Show Districts</span>
                </label>
              </div>
            </div>

            {/* Base Map Style Selector */}
            <div className="flex items-center">
              <select
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                value={selectedStyle.key}
                onChange={(e) => {
                  const next = styles.find((s) => s.key === e.target.value);
                  if (next) setSelectedStyle(next);
                }}
              >
                {styles.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Layers Section - Only visible when state is selected */}
          {selectedState && (
            <div className="mt-3">
              <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-gray-600">Layers:</span>
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
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute top-20 left-4 z-30">
          <div className="rounded-md border border-amber-300 bg-amber-50/95 text-amber-900 p-2 text-xs max-w-sm">
            {error}
          </div>
        </div>
      )}

      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="flex-1 w-full bg-gray-100"
        style={{ minHeight: 'calc(100vh - 100px)' }} 
      />
    </div>
  );
}
