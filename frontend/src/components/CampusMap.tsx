import { useEffect } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RouteResponse } from '../types/route';

interface CampusMapProps {
  routeData: RouteResponse | null;
}

function formatDistance(distanceMeters?: number) {
  if (!distanceMeters || distanceMeters <= 0) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CU_BOULDER_CENTER: [number, number] = [40.0076, -105.2659];

function RouteViewportController({
  positions,
}: {
  positions: Array<[number, number]>;
}) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) {
      map.setView(CU_BOULDER_CENTER, 15);
      return;
    }

    if (positions.length === 1) {
      map.setView(positions[0], 17);
      return;
    }

    map.fitBounds(L.latLngBounds(positions), {
      padding: [40, 40],
    });
  }, [map, positions]);

  return null;
}

export default function CampusMap({ routeData }: CampusMapProps) {
  const distanceLabel = formatDistance(routeData?.distanceMeters);
  const startLabel = routeData?.matchedStart?.displayName;
  const endLabel = routeData?.matchedEnd?.displayName;
  const routeCoordinates =
    routeData?.status === 'success'
      ? routeData.route.map(
          (point): [number, number] => [point.latitude, point.longitude],
        )
      : [];

  const markerPositions: Array<[number, number]> = [];
  if (routeData?.matchedStart) {
    markerPositions.push([
      routeData.matchedStart.latitude,
      routeData.matchedStart.longitude,
    ]);
  }
  if (routeData?.matchedEnd) {
    markerPositions.push([
      routeData.matchedEnd.latitude,
      routeData.matchedEnd.longitude,
    ]);
  }

  const viewportPositions =
    routeCoordinates.length > 0 ? routeCoordinates : markerPositions;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] border border-slate-200 bg-slate-100 shadow-lg">
      {(startLabel || endLabel) && (
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500]">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 text-sm shadow-[0_14px_32px_-20px_rgba(15,23,42,0.7)] backdrop-blur">
            {startLabel && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                {startLabel}
              </span>
            )}
            {startLabel && endLabel && (
              <span className="text-slate-400" aria-hidden="true">
                →
              </span>
            )}
            {endLabel && (
              <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">
                {endLabel}
              </span>
            )}
            {distanceLabel && (
              <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                {distanceLabel}
              </span>
            )}
          </div>
        </div>
      )}

      <MapContainer
        center={CU_BOULDER_CENTER}
        zoom={15}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RouteViewportController positions={viewportPositions} />

        {!routeData?.matchedStart && !routeData?.matchedEnd && (
          <Marker position={CU_BOULDER_CENTER}>
            <Popup>
              <div className="text-center font-bold text-slate-800">
                CU Boulder Campus
                <br />
                Search for a route to begin.
              </div>
            </Popup>
          </Marker>
        )}

        {routeData?.matchedStart && (
          <Marker
            position={[
              routeData.matchedStart.latitude,
              routeData.matchedStart.longitude,
            ]}
          >
            <Popup>Start: {routeData.matchedStart.displayName}</Popup>
          </Marker>
        )}

        {routeData?.matchedEnd && (
          <Marker
            position={[routeData.matchedEnd.latitude, routeData.matchedEnd.longitude]}
          >
            <Popup>End: {routeData.matchedEnd.displayName}</Popup>
          </Marker>
        )}

        {routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates}
            color="indigo"
            weight={5}
            opacity={0.85}
          />
        )}
      </MapContainer>
    </div>
  );
}
