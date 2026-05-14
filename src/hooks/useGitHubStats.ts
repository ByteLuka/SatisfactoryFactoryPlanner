import { useEffect, useState } from 'react';

interface GitHubStats {
  stars: number;
  forks: number;
}

type StatsState =
  | { status: 'loading' }
  | { status: 'success'; data: GitHubStats }
  | { status: 'error' };

const REPO = 'byteluka/SatisfactoryFactoryPlanner';
let cached: GitHubStats | null = null;

export function useGitHubStats(): StatsState {
  const [state, setState] = useState<StatsState>(
    cached ? { status: 'success', data: cached } : { status: 'loading' },
  );

  useEffect(() => {
    if (cached) return;
    fetch(`https://api.github.com/repos/${REPO}`)
      .then(r => r.json())
      .then(data => {
        cached = { stars: data.stargazers_count, forks: data.forks_count };
        setState({ status: 'success', data: cached });
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  return state;
}
