import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fixing default leaflet marker icons

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
});

// CU Boulder rough coordinates

const CU_BOULDER_CENTER: [number, number] = [40.0076, -105.2659];

export default function CampusMap() {
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
            </MapContainer>
        </div>
    );
}