import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Prop from App.tsx

interface CampusMapProps {
    routeData?: any
}

// Fixing default leaflet marker icons

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
});

// CU Boulder rough coordinates

const CU_BOULDER_CENTER: [number, number] = [40.0076, -105.2659];

export default function CampusMap({ routeData }: CampusMapProps) {
    // 1. If we have a route, extract the latitude and longitude from the Neo4j data
    // Leaflet take the data (latitude, longitude as an array)
    const routeCoordinates = routeData?.route?.map((node: any) => [node.latitude, node.longitude]) || [];
    return (
        <div className='h-full w-full rounded-xl overflow-hidden shadow-lg border-slate-200'>
            <MapContainer
                center={CU_BOULDER_CENTER}
                zoom={15}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
            >

                <TileLayer
                    attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/*Single dropdown marker for now*/}
                <Marker position={CU_BOULDER_CENTER}>
                    <Popup>
                        <div className='text-center font-bold text-slate-800'>
                            CU Boulder Campus<br /> We will map paths here!
                        </div>
                    </Popup>
                </Marker>

                {/* Draw the AI-gererated path*/}
                {routeCoordinates.length > 0 && (
                    <Polyline positions={routeCoordinates}
                        color='indigo'
                        weight={5}
                        opacity={0.8}
                    />
                )}
            </MapContainer>
        </div>
    );
}