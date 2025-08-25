import { useEffect, useState, useRef } from "react";
import {
  GoogleMap,
  Marker,
  useJsApiLoader,
  DrawingManager,
} from "@react-google-maps/api";

const containerStyle = { width: "100%", height: "600px" };

export default function Dashboard() {
  const [coords, setCoords] = useState({ lat: 51.505, lng: -0.09 });
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState(null); // only one region allowed
  const mapRef = useRef(null); // GoogleMap instance
  const mapShapeRef = useRef(null); // currently drawn shape (Polygon/Rectangle)
  const drawingManagerRef = useRef(null); // single DrawingManager instance

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

  const deleteRegion = () => {
    if (mapShapeRef.current) {
      mapShapeRef.current.setMap(null);
      mapShapeRef.current = null;
    }
    setRegion(null);
  };

  if (loading || !isLoaded) return <p>Loading map...</p>;

  return (
    <div className="flex flex-col h-screen w-screen">
      <header className="bg-gray-800 text-white p-4">My Dashboard</header>
      <main className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-80 bg-gray-100 p-4 border-r overflow-y-auto">
          <h2 className="font-bold text-lg mb-2">App Menu</h2>
          {region ? (
            <div className="bg-white rounded shadow p-3 text-sm relative">
              <button
                onClick={deleteRegion}
                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
              >
                ❌
              </button>
              <h3 className="font-semibold">
                {region.type === "polygon" ? "Polygon" : "Rectangle"}
              </h3>
              {region.type === "polygon" && (
                <ul className="list-disc pl-4">
                  {region.coords.map((c, i) => (
                    <li key={i}>
                      {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                    </li>
                  ))}
                </ul>
              )}
              {region.type === "rectangle" && (
                <div>
                  <p>
                    <strong>NE:</strong> {region.northEast.lat.toFixed(5)},{" "}
                    {region.northEast.lng.toFixed(5)}
                  </p>
                  <p>
                    <strong>SW:</strong> {region.southWest.lat.toFixed(5)},{" "}
                    {region.southWest.lng.toFixed(5)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">Draw a region on the map.</p>
          )}
        </aside>

        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: "600px" }}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={coords}
            zoom={12}
            options={{ mapTypeId: "satellite" }}
            onLoad={(map) => (mapRef.current = map)}
          >
            <Marker position={coords} />

            {/* Single DrawingManager */}
            {!drawingManagerRef.current && (
              <DrawingManager
                onLoad={(dm) => (drawingManagerRef.current = dm)}
                onPolygonComplete={(polygon) => {
                  if (mapShapeRef.current) {
                    alert("Delete the existing region before drawing a new one.");
                    polygon.setMap(null);
                    return;
                  }

                  const path = polygon.getPath();
                  const coordsArray = [];
                  for (let i = 0; i < path.getLength(); i++) {
                    const point = path.getAt(i);
                    coordsArray.push({ lat: point.lat(), lng: point.lng() });
                  }

                  const newPolygon = new window.google.maps.Polygon({
                    paths: coordsArray,
                    map: mapRef.current,
                    fillColor: "#2196F3",
                    fillOpacity: 0.3,
                    strokeColor: "#0D47A1",
                    strokeWeight: 2,
                  });

                  mapShapeRef.current = newPolygon;
                  setRegion({ type: "polygon", coords: coordsArray });
                  polygon.setMap(null); // remove temporary drawing
                }}
                onRectangleComplete={(rectangle) => {
                  if (mapShapeRef.current) {
                    alert("Delete the existing region before drawing a new one.");
                    rectangle.setMap(null);
                    return;
                  }

                  const bounds = rectangle.getBounds();
                  const ne = bounds.getNorthEast();
                  const sw = bounds.getSouthWest();

                  const newRectangle = new window.google.maps.Rectangle({
                    bounds: {
                      north: ne.lat(),
                      east: ne.lng(),
                      south: sw.lat(),
                      west: sw.lng(),
                    },
                    map: mapRef.current,
                    fillColor: "#4CAF50",
                    fillOpacity: 0.3,
                    strokeColor: "#1B5E20",
                    strokeWeight: 2,
                  });

                  mapShapeRef.current = newRectangle;
                  setRegion({
                    type: "rectangle",
                    northEast: { lat: ne.lat(), lng: ne.lng() },
                    southWest: { lat: sw.lat(), lng: sw.lng() },
                  });

                  rectangle.setMap(null); // remove temporary drawing
                }}
                options={{
                  drawingControl: true,
                  drawingControlOptions: {
                    position: window.google.maps.ControlPosition.TOP_CENTER,
                    drawingModes: ["polygon", "rectangle"],
                  },
                }}
              />
            )}
          </GoogleMap>
        </div>
      </main>
    </div>
  );
}
