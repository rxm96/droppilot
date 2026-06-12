// scripts/release-notes/lib/githubApi.mjs
export async function fetchCompareCommits({ repo, baseTag, tag, token }) {
  const url = `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(baseTag)}...${encodeURIComponent(tag)}?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`compare API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
