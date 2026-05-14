import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';

const STEPS = [
  {
    number: '1',
    title: 'Set your game progress',
    description:
      "Tell the planner which Space Elevator phases you've completed, which HUB milestones you've unlocked, which MAM research nodes you've finished, and which alternate recipes you've found from Hard Drives.",
  },
  {
    number: '2',
    title: 'Define production targets',
    description:
      "Pick what you want to produce and how much (or let the solver maximise output). Restrict the resource pool, disable recipes you don't want to use, and import items from other factories.",
  },
  {
    number: '3',
    title: 'Get an optimal production plan',
    description:
      'The LP solver finds the exact machine counts and recipes needed to hit your targets. An interactive graph shows the full production chain with power usage and byproduct tracking.',
  },
];

const PLANNED = [
  'Phase 3 — interactive factory layout editor with drag-and-drop machine placement',
  'Belt/pipe routing between machines',
  'Read-only rebuild mode: a step-by-step checklist to follow in-game',
  'Save and share plans via URL',
  'Public plan gallery',
];

const DIFFERENTIATORS = [
  {
    title: 'Game-state aware',
    body: "You declare your actual progress. The planner only shows recipes and buildings you've actually unlocked — no manually filtering out things you don't have yet.",
  },
  {
    title: 'LP-based optimisation',
    body: 'Uses linear programming (not hand-crafted heuristics) to find mathematically optimal production ratios. Multiple strategies: maximise output, minimise machines, or minimise distinct recipes.',
  },
  {
    title: 'Works offline',
    body: "Fully client-side — no account, no server, no data sent anywhere. Your plan is saved to your browser's local storage.",
  },
  {
    title: 'Open source',
    body: 'MIT licensed. Built with TypeScript, React, Vite, and ELK graph layout. Contributions welcome.',
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#1a1a1f] text-[#e8e8f0] flex flex-col">
      <AppHeader />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-12">
        {/* Hero */}
        <section className="flex flex-col gap-4">
          <div className="inline-flex items-center gap-2 bg-[#e8820c]/10 border border-[#e8820c]/30 rounded-full px-4 py-1.5 self-start">
            <span className="w-2 h-2 rounded-full bg-[#e8820c] animate-pulse" />
            <span className="text-[#e8820c] text-sm font-medium">Early development — expect rough edges</span>
          </div>
          <h2 className="text-4xl font-bold text-[#e8e8f0] leading-tight">
            Plan your Satisfactory factories<br />
            <span className="text-[#e8820c]">the optimal way.</span>
          </h2>
          <p className="text-[#8888a0] text-xl max-w-2xl leading-relaxed">
            A browser-based factory planner that knows what you've actually unlocked. Declare your
            game progress, set your production targets, and get a mathematically optimal production
            chain — complete with machine counts, power usage, and a full dependency graph.
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => navigate('/phase1')}
              className="bg-[#e8820c] hover:bg-[#c4690a] text-white font-semibold px-6 py-3 rounded-md transition-colors text-base"
            >
              Get started →
            </button>
            <a
              href="https://github.com/byteluka/SatisfactoryFactoryPlanner"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#25252d] hover:bg-[#2e2e38] border border-[#3a3a46] hover:border-[#e8820c]/40 text-[#8888a0] hover:text-[#e8e8f0] font-medium px-6 py-3 rounded-md transition-colors text-base"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* Early dev notice */}
        <section className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-5">
          <h3 className="text-[#e8820c] font-semibold text-base mb-2">About this early release</h3>
          <p className="text-[#8888a0] text-base leading-relaxed">
            This app is actively being built. Phases 1 (game state) and 2 (LP production planner)
            are usable, but you may encounter missing features, visual inconsistencies, or solver
            edge cases that aren't handled gracefully yet. Phase 3 (factory layout editor) is not
            yet implemented. If something looks wrong, a hard refresh (Ctrl+Shift+R) often helps —
            game data is cached in the browser session.
          </p>
        </section>

        {/* How it works */}
        <section>
          <h3 className="text-[#e8e8f0] font-bold text-2xl mb-6">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map(step => (
              <div key={step.number} className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-5 flex flex-col gap-3">
                <div className="w-8 h-8 rounded-full bg-[#e8820c]/15 border border-[#e8820c]/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#e8820c] font-bold text-base">{step.number}</span>
                </div>
                <div>
                  <h4 className="text-[#e8e8f0] font-semibold text-base mb-1">{step.title}</h4>
                  <p className="text-[#8888a0] text-base leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why different */}
        <section>
          <h3 className="text-[#e8e8f0] font-bold text-2xl mb-6">Why this planner?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DIFFERENTIATORS.map(d => (
              <div key={d.title} className="bg-[#25252d] border border-[#3a3a46] rounded-lg p-5">
                <h4 className="text-[#e8e8f0] font-semibold text-base mb-1">{d.title}</h4>
                <p className="text-[#8888a0] text-base leading-relaxed">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Planned features */}
        <section>
          <h3 className="text-[#e8e8f0] font-bold text-2xl mb-4">What's coming</h3>
          <ul className="flex flex-col gap-2">
            {PLANNED.map(item => (
              <li key={item} className="flex items-start gap-3 text-base text-[#8888a0]">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#3a3a46] flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-[#3a3a46] px-6 py-4 max-w-5xl mx-auto w-full">
        <p className="text-[#8888a0] text-sm">
          Not affiliated with Coffee Stain Studios. Satisfactory is a trademark of Coffee Stain Studios AB.
        </p>
      </footer>
    </div>
  );
}
