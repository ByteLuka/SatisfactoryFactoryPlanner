import { useNavigate } from 'react-router-dom';
import { useGitHubStats } from '../hooks/useGitHubStats';

const REPO_URL = 'https://github.com/byteluka/SatisfactoryFactoryPlanner';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path d="M7 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0v3m10-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0v3m-5 5v7m0-7a4 4 0 0 0-4-4m4 4a4 4 0 0 1 4-4m-4 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GitHubIndicator() {
  const stats = useGitHubStats();

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-[#25252d] hover:bg-[#2e2e38] border border-[#3a3a46] hover:border-[#e8820c]/40 rounded-md px-3 py-1.5 text-[#8888a0] hover:text-[#e8e8f0] transition-colors text-sm"
      title="View on GitHub"
    >
      <GitHubIcon />
      {stats.status === 'success' && (
        <>
          <span className="flex items-center gap-1">
            <StarIcon />
            {stats.data.stars}
          </span>
          <span className="flex items-center gap-1">
            <ForkIcon />
            {stats.data.forks}
          </span>
        </>
      )}
      {stats.status === 'loading' && <span className="opacity-50">—</span>}
    </a>
  );
}

interface AppHeaderProps {
  step?: 1 | 2 | 3;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  rightExtra?: React.ReactNode;
}

export function AppHeader({ step, subtitle, backTo, backLabel, rightExtra }: AppHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="border-b border-[#3a3a46] bg-[#1a1a1f] sticky top-0 z-20 flex-shrink-0">
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Left: back button + title */}
        <div className="flex items-center gap-4">
          {backTo && (
            <button
              onClick={() => navigate(backTo)}
              className="text-[#8888a0] hover:text-[#e8e8f0] text-base transition-colors"
            >
              ← {backLabel ?? 'Back'}
            </button>
          )}
          <div>
            <h1
              className="text-[#e8820c] font-bold text-xl tracking-wide cursor-pointer hover:text-[#c4690a] transition-colors"
              onClick={() => navigate('/')}
            >
              Satisfactory Factory Planner
            </h1>
            {subtitle && <p className="text-[#8888a0] text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>

        {/* Right: extra content + step dots + GitHub */}
        <div className="flex items-center gap-4">
          {rightExtra}
          {step !== undefined && (
            <div className="flex gap-1">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    s === step
                      ? 'bg-[#e8820c]'
                      : s < step
                        ? 'bg-[#e8820c]/40'
                        : 'bg-[#3a3a46]'
                  }`}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[#8888a0] text-xs font-mono select-none leading-none">
              v{__APP_VERSION__}
            </span>
            <GitHubIndicator />
          </div>
        </div>
      </div>
    </header>
  );
}
