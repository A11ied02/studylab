const GITHUB_PAGES_ASSET_BASE = 'https://a11ied02.github.io/studylab/';

export function getGitHubPagesAssetUrl(relativePath: string): string {
  if (/^(?:https?:|data:)/i.test(relativePath)) return relativePath;
  return new URL(relativePath.replace(/^\/+/, ''), GITHUB_PAGES_ASSET_BASE).href;
}
