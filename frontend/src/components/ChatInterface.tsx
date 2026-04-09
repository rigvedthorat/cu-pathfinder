import { useState } from 'react';
import type {
  AccessibilityStatus as RouteAccessibilityStatus,
  RouteInstruction,
  RouteResponse,
  SuggestedPlace,
} from '../types/route';

interface ChatInterfaceProps {
  onRouteRequested: (start: string, end: string, prompt: string) => void;
  isLoading: boolean;
  routeData: RouteResponse | null;
}

const COLLAPSED_INSTRUCTION_COUNT = 4;

function formatDistance(distanceMeters?: number): string | null {
  if (distanceMeters === undefined) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  const miles = distanceMeters * 0.000621371;
  return `${miles.toFixed(2)} mi`;
}

function statusLabel(status: RouteResponse['status']): string {
  switch (status) {
    case 'success':
      return 'Route Ready';
    case 'no_route':
      return 'No Route';
    case 'ambiguous_start':
    case 'ambiguous_end':
      return 'Need Clarification';
    case 'unresolved_start':
    case 'unresolved_end':
      return 'Location Not Found';
    case 'safety_escalation':
      return 'Safety Alert';
  }
}

function statusTone(status: RouteResponse['status']): string {
  switch (status) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'safety_escalation':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'no_route':
    case 'ambiguous_start':
    case 'ambiguous_end':
    case 'unresolved_start':
    case 'unresolved_end':
      return 'border-amber-200 bg-amber-50 text-amber-900';
  }
}

function SuggestionPills({
  suggestions,
  field,
  onApply,
}: {
  suggestions: SuggestedPlace[];
  field: 'start' | 'end';
  onApply: (field: 'start' | 'end', suggestion: SuggestedPlace) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={`${field}-${suggestion.displayName}`}
          type="button"
          onClick={() => onApply(field, suggestion)}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-100"
        >
          {suggestion.displayName}
        </button>
      ))}
    </div>
  );
}

function RouteFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function PlannerSummary({
  start,
  end,
  prompt,
  status,
  onEdit,
}: {
  start: string;
  end: string;
  prompt: string;
  status: RouteResponse['status'];
  onEdit: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
            Current Route
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="rounded-full bg-white/10 px-3 py-1 text-white/95">
              {start || 'Start'}
            </span>
            <span className="text-slate-400" aria-hidden="true">
              →
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-900">
              {end || 'Destination'}
            </span>
          </div>
          {prompt.trim() && (
            <p className="mt-3 text-sm leading-5 text-slate-300">
              Accessibility: {prompt.trim()}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone(status)}`}
          >
            {statusLabel(status)}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-white/20 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-900 transition-colors hover:bg-slate-100"
          >
            Edit Route
          </button>
        </div>
      </div>
    </section>
  );
}

function RouteInstructions({
  instructions,
}: {
  instructions: RouteInstruction[];
}) {
  const [showAllInstructions, setShowAllInstructions] = useState(false);

  const visibleInstructions = showAllInstructions
    ? instructions
    : instructions.slice(0, COLLAPSED_INSTRUCTION_COUNT);
  const hiddenInstructionCount = Math.max(
    0,
    instructions.length - visibleInstructions.length,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Navigation
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            Step-by-step directions
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {instructions.length} steps
        </span>
      </div>

      <ol className="mt-4 divide-y divide-slate-200">
        {visibleInstructions.map((instruction, index) => (
          <li
            key={`${instruction.title}-${index}`}
            className="flex gap-3 py-4 first:pt-0 last:pb-0"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {instruction.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {instruction.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {instructions.length > COLLAPSED_INSTRUCTION_COUNT && (
        <button
          type="button"
          onClick={() => setShowAllInstructions((value) => !value)}
          className="mt-4 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:bg-slate-100"
        >
          {showAllInstructions
            ? 'Show Fewer Steps'
            : `Show ${hiddenInstructionCount} More Steps`}
        </button>
      )}
    </section>
  );
}

function AccessibilityStatusCard({
  accessibilityStatus,
}: {
  accessibilityStatus: RouteAccessibilityStatus;
}) {
  const isConfirmed = accessibilityStatus.level === 'confirmed';

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${
        isConfirmed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            Accessibility
          </p>
          <p className="mt-1 text-base font-semibold">
            {isConfirmed ? 'Accessible route confirmed' : 'Best available accessible route'}
          </p>
          <p className="mt-2 text-sm leading-6">
            {accessibilityStatus.message}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
            isConfirmed
              ? 'border-emerald-300 bg-white/80 text-emerald-800'
              : 'border-amber-300 bg-white/80 text-amber-900'
          }`}
        >
          {isConfirmed ? 'Confirmed' : 'Best Effort'}
        </span>
      </div>
    </section>
  );
}

function RouteOutcomeCard({
  routeData,
  distanceLabel,
}: {
  routeData: RouteResponse;
  distanceLabel: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Route Overview
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {routeData.message}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone(routeData.status)}`}
        >
          {statusLabel(routeData.status)}
        </span>
      </div>

      {(routeData.matchedStart || routeData.matchedEnd || distanceLabel) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <RouteFact
            label="Start"
            value={routeData.matchedStart?.displayName ?? 'Not resolved'}
          />
          <RouteFact
            label="End"
            value={routeData.matchedEnd?.displayName ?? 'Not resolved'}
          />
          <RouteFact label="Distance" value={distanceLabel ?? 'N/A'} />
        </div>
      )}
    </section>
  );
}

export default function ChatInterface({
  onRouteRequested,
  isLoading,
  routeData,
}: ChatInterfaceProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isPlannerExpanded, setIsPlannerExpanded] = useState(true);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!start.trim() || !end.trim()) {
      return;
    }

    setIsPlannerExpanded(false);
    onRouteRequested(start.trim(), end.trim(), prompt.trim());
  };

  const handleSwapLocations = () => {
    setStart(end);
    setEnd(start);
  };

  const applySuggestion = (
    field: 'start' | 'end',
    suggestion: SuggestedPlace,
  ) => {
    if (field === 'start') {
      setStart(suggestion.displayName);
      return;
    }

    setEnd(suggestion.displayName);
  };

  const distanceLabel = formatDistance(routeData?.distanceMeters);
  const showPlannerForm = !routeData || isPlannerExpanded;
  const showPlannerSummary = Boolean(routeData) && !isPlannerExpanded;
  const routeInstructionsKey = [
    routeData?.matchedStart?.displayName ?? '',
    routeData?.matchedEnd?.displayName ?? '',
    routeData?.distanceMeters ?? '',
    routeData?.instructions.length ?? 0,
  ].join('|');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        {showPlannerSummary && routeData && (
          <PlannerSummary
            start={start}
            end={end}
            prompt={prompt}
            status={routeData.status}
            onEdit={() => setIsPlannerExpanded(true)}
          />
        )}

        {showPlannerForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Route Search
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enter two campus locations. Add accessibility notes only if
                  they should change the route.
                </p>
              </div>
              {routeData && (
                <button
                  type="button"
                  onClick={() => setIsPlannerExpanded(false)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Done Editing
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label
                    htmlFor="route-start"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Start
                  </label>
                  {routeData?.suggestions?.start && (
                    <span className="text-xs font-medium text-amber-700">
                      Closest matches
                    </span>
                  )}
                </div>
                <input
                  id="route-start"
                  type="text"
                  placeholder="C4C, Engineering Center, Norlin..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/30"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
                {routeData?.suggestions?.start && (
                  <SuggestionPills
                    suggestions={routeData.suggestions.start}
                    field="start"
                    onApply={applySuggestion}
                  />
                )}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:bg-slate-100"
                >
                  <span>Swap</span>
                  <span aria-hidden="true">⇅</span>
                </button>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label
                    htmlFor="route-end"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Destination
                  </label>
                  {routeData?.suggestions?.end && (
                    <span className="text-xs font-medium text-amber-700">
                      Closest matches
                    </span>
                  )}
                </div>
                <input
                  id="route-end"
                  type="text"
                  placeholder="UMC, Wolf Law, Farrand..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/30"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
                {routeData?.suggestions?.end && (
                  <SuggestionPills
                    suggestions={routeData.suggestions.end}
                    field="end"
                    onApply={applySuggestion}
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor="route-accessibility"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Accessibility Notes
                </label>
                <textarea
                  id="route-accessibility"
                  placeholder="Optional: I am on crutches, it is dark, avoid stairs..."
                  className="h-20 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/30"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold tracking-wide text-white transition-colors ${
                isLoading
                  ? 'cursor-not-allowed bg-slate-400'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {isLoading ? 'Finding Route...' : 'Find Safe Route'}
            </button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!routeData ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-5 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">
              Search to see route details.
            </p>
            <p className="mt-2 leading-6">
              Results, warnings, and directions will appear here once a route is
              found.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {routeData.accessibilityStatus && (
              <AccessibilityStatusCard
                accessibilityStatus={routeData.accessibilityStatus}
              />
            )}

            {routeData.warnings.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  Warnings
                </p>
                <ul className="mt-3 space-y-2 leading-6">
                  {routeData.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}

            {routeData.instructions.length > 0 && (
              <RouteInstructions
                key={routeInstructionsKey}
                instructions={routeData.instructions}
              />
            )}

            <RouteOutcomeCard
              routeData={routeData}
              distanceLabel={distanceLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
