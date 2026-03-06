import { useState } from 'react';

// 1. Define what the props should look like
interface ChatInterfaceProps {
    onRouteRequested: (start: string, end: string, prompt: string) => void;
    isLoading: boolean;
    routeData?: any;
}

export default function ChatInterface({ onRouteRequested, isLoading, routeData }: ChatInterfaceProps) {
    // React State to hold the user input
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [prompt, setPrompt] = useState('');

    // What happens when user selects 'Find Safe Route'
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!start || !end || !prompt) return;

        onRouteRequested(start, end, prompt);
    };

    return (
        <div className='flex flex-col h-full space-y-4'>
            {/* Top half for messages */}
            <div className='flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-4 mb-2'>
                {routeData ? (
                    <div className='bg-white p-3 rounded-lg shadow-sm border border-slate-200'>
                        <p className='text-sm text-slate-700'>{routeData?.message}</p>
                    </div>
                ) : (
                    <p className='text-sm text-slate-500 text-center mt-10'>
                        Describe your route and any accessibility concerns!
                    </p>
                )}
            </div>

            {/* Bottom half: The Form */}
            <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
                <input
                    type='text'
                    placeholder='Where are you starting from?'
                    className='border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-yellow-500 outline-none'
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                />

                <input
                    type='text'
                    placeholder='Where are you going?'
                    className='border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-yellow-500 outline-none'
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                />

                <textarea
                    placeholder="Any special requests? (e.g. 'I am on crutches', or 'It is dark')"
                    className='border-slate-300 rounded-md p-2 text-sm h-20 resize-none focus:ring-2 focus:ring-yellow-500 outline-none'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />

                <button
                    type='submit'
                    disabled={isLoading}
                    className={`py-2 px-4 rounded text-white font-bold tracking-wide transition-colors ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700'
                        }`}
                >
                    {isLoading ? 'Consulting AI....' : 'Find Safe Route'}
                </button>
            </form>
        </div>
    );
}