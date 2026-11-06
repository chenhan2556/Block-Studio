import { defineConfig } from 'vite';

function getBasePath() {
  if (process.env.GITHUB_ACTIONS !== 'true') return '/';

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repositoryName) throw new Error('GITHUB_REPOSITORY is required to deploy to GitHub Pages.');
  if (repositoryName.endsWith('.github.io')) return '/';

  return `/${repositoryName}/`;
}

export default defineConfig({
  base: getBasePath(),
});
