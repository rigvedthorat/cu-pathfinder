import { useState } from 'react';
import CampusMap from './components/CampusMap';
import ChatInterface from './components/ChatInterface';
import type { RouteResponse } from './types/route';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [routeData, setRouteData] = useState<RouteResponse | null>(null);

  const handleRouteRequest = async (
    start: string,
    end: string,
    prompt: string,
  ) => {
    setIsLoading(true);
    setRouteData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start, end, prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch route');
      }

      const data = (await response.json()) as RouteResponse;
      setRouteData(data);
    } catch (error) {
      console.error('Error fetching route', error);
      alert('Uh oh! We could not connect to the backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <header className="z-10 border-b border-yellow-600/30 bg-yellow-500 px-5 py-3 text-slate-950 shadow-sm">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-[1.9rem] font-bold tracking-tight">CU Pathfinder</h1>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900/75">
            The Inclusive Campus Companion
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-3 md:p-4 lg:p-5">
        <div className="mx-auto grid h-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div className="relative min-h-[46vh] overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] md:min-h-0">
            <CampusMap routeData={routeData} />
          </div>

          <div className="flex min-h-0 flex-col rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.3)] backdrop-blur-sm">
            <div className="mb-2 shrink-0 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Route Planner
              </p>
              <h2 className="mt-1.5 text-lg font-bold text-slate-900">
                Find a safer path across campus
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Search once, scan the route quickly, and keep the map in view.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatInterface
                isLoading={isLoading}
                onRouteRequested={handleRouteRequest}
                routeData={routeData}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
