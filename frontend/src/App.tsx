import { useState } from 'react';
import CampusMap from './components/CampusMap';
import ChatInterface from './components/ChatInterface';

export default function App() {
  const [isLoading, setIsloading] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);

  // Function that ChatInterface will call when the user clicks 'Find Safe Route'
  const handleRouteRequest = async (start: string, end: string, prompt: string) => {
    // 1. load the buffering icon
    setIsloading(true)

    try {
      // 2. Make the HTTP request to NestJS
      const response = await fetch('http://localhost:3000/route', {
        method: 'POST',
        headers: {
          'Content-type': 'application/json',
        },
        body: JSON.stringify({ start, end, prompt }),
      });

      // 3. Check if the server crashed or threw an error
      if (!response.ok) {
        throw new Error('Failed to fetch route');
      }

      // 4. Parse the successful JSON data
      const data = await response.json();
      console.log('Raw backend data: ', data);
      setRouteData(data);

    } catch (error) {
      console.error('Error fetching route', error);
      alert('Uh oh! We could not connect to the backend.');
    } finally {
      // 5. Turn off the spinner when the backend call is successful or failure

      setIsloading(false)
    }
  };

  return (
    <div className='flex flex-col h-screen bg-slate-50'>
      {/*Header bar*/}
      <header className="bg-yellow-500 text-slate-900 p-4 shadow-md z-10">
        <h1 className='text-3xl font-bold'>CU Pathfinder</h1>
        <p className='text-sm font-medium'>The Inclusive Campus Companion</p>
      </header>
      {/*Main content area*/}
      <main className='flex-1 p-4 md:p-6 lg:p-8'>
        <div className='max-w-7xl mx-auto h-full flex flex-col md:flex-row gap-6'>

          {/*Left side: the interactve map*/}
          <div className='flex-grow h-[50vh] md:h-full relative z-0'>
            <CampusMap
              routeData={routeData}
            />
          </div>
          {/*Right side: Sidebar for AI Chat*/}
          <div className='w-full md:w-96 bg-white rounded-xl shadow-lg border-2 border-slate-200 p-6 flex flex-col'>
            <h2 className='text-xl font-bold mb-4 text-slate-800'>Find a Route</h2>
            <div className='flex-1 overflow-hidden'>
              <ChatInterface isLoading={isLoading}
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