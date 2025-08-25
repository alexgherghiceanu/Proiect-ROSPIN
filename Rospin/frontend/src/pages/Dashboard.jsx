import { useEffect, useState, useCallback } from "react";
import {
  GoogleMap,
  Marker,
  Polygon,
  Rectangle,
  useJsApiLoader,
  DrawingManager,
} from "@react-google-maps/api";

const containerStyle = { width: "100%", height: "600px" };

export default function Dashboard() {
  const [coords, setCoords] = useState({ lat: 51.505, lng: -0.09 });
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);

  // Store map shape references
  const [mapShapes, setMapShapes] = useState([]);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: ["drawing"],
  });

  // Detect user location
  useEffect(() => {
    fetch("https://ipwho.is/")
      .then((res) => res.json())
      .then((data) => {
        if (data.latitude && data.longitude)
          setCoords({ lat: data.latitude, lng: data.longitude });
      })
      .finally(() => setLoading(false));
  }, []);

  const deleteRegion = useCallback(
    (idx) => {
      // Remove from state
      setRegions((prev) => prev.filter((_, i) => i !== idx));
      if (selectedIdx === idx) setSelectedIdx(null);

      // Remove the actual shape from the map
      if (mapShapes[idx]) {
        mapShapes[idx].setMap(null);
        setMapShapes((prev) => prev.filter((_, i) => i !== idx));
      }
    },
    [selectedIdx, mapShapes]
  );

  if (loading || !isLoaded) return <p>Loading map...</p>;

  return (
    <div className="flex flex-col h-screen w-screen">
      <header className="bg-gray-800 text-white p-4">My Dashboard</header>
      <main className="flex flex-1">
        {/* App Menu */}
        <aside className="w-80 bg-gray-100 p-4 border-r overflow-y-auto">
          <h2 className="font-bold text-lg mb-2">App Menu</h2>
          {regions.length === 0 ? (
            <p className="text-gray-500">No regions drawn yet.</p>
          ) : (
            <div className="space-y-4">
              {regions.map((region, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded shadow p-3 text-sm relative cursor-pointer ${
                    selectedIdx === idx ? "border-2 border-blue-500" : ""
                  }`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRegion(idx);
                    }}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                  >
                    ❌
                  </button>
                  <h3 className="font-semibold">
                    Region {idx + 1} ({region.type})
                  </h3>
                  {region.type === "rectangle" && (
                    <>
                      <p>
                        <strong>NE:</strong>{" "}
                        {region.northEast.lat.toFixed(5)}, {region.northEast.lng.toFixed(5)}
                      </p>
                      <p>
                        <strong>SW:</strong>{" "}
                        {region.southWest.lat.toFixed(5)}, {region.southWest.lng.toFixed(5)}
                      </p>
                    </>
                  )}
                  {region.type === "polygon" && (
                    <ul className="list-disc pl-4">
                      {region.coords.map((c, i) => (
                        <li key={i}>
                          {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Map Area */}
        <div className="flex-1 relative" style={{ minHeight: "600px" }}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={coords}
            zoom={12}
            options={{ mapTypeId: "satellite" }}
          >
            <Marker position={coords} />

            {/* Drawing Manager */}
            <DrawingManager
              onPolygonComplete={(polygon) => {
                const path = polygon.getPath();
                const coordsArray = [];
                for (let i = 0; i < path.getLength(); i++) {
                  const point = path.getAt(i);
                  coordsArray.push({ lat: point.lat(), lng: point.lng() });
                }
                // Save region data
                setRegions((prev) => [...prev, { type: "polygon", coords: coordsArray }]);
                // Save map shape
                setMapShapes((prev) => [...prev, polygon]);
              }}
              onRectangleComplete={(rectangle) => {
                const bounds = rectangle.getBounds();
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                setRegions((prev) => [
                  ...prev,
                  { type: "rectangle", northEast: { lat: ne.lat(), lng: ne.lng() }, southWest: { lat: sw.lat(), lng: sw.lng() } },
                ]);
                setMapShapes((prev) => [...prev, rectangle]);
              }}
              options={{
                drawingControl: true,
                drawingControlOptions: {
                  position: window.google.maps.ControlPosition.TOP_CENTER,
                  drawingModes: ["polygon", "rectangle"],
                },
              }}
            />

            {/* Render regions visually */}
            {regions.map((region, idx) =>
              region.type === "polygon" ? (
                <Polygon
                  key={idx}
                  paths={region.coords}
                  options={{
                    fillColor: "#2196F3",
                    fillOpacity: 0.3,
                    strokeColor: selectedIdx === idx ? "#FF0000" : "#0D47A1",
                    strokeWeight: selectedIdx === idx ? 4 : 2,
                  }}
                  onClick={() => setSelectedIdx(idx)}
                />
              ) : (
                <Rectangle
                  key={idx}
                  bounds={{
                    north: region.northEast.lat,
                    east: region.northEast.lng,
                    south: region.southWest.lat,
                    west: region.southWest.lng,
                  }}
                  options={{
                    fillColor: "#4CAF50",
                    fillOpacity: 0.3,
                    strokeColor: selectedIdx === idx ? "#FF0000" : "#1B5E20",
                    strokeWeight: selectedIdx === idx ? 4 : 2,
                  }}
                  onClick={() => setSelectedIdx(idx)}
                />
              )
            )}
          </GoogleMap>
        </div>
      </main>
    </div>
  );
}
