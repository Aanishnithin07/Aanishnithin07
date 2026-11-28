#!/usr/bin/env node
// Fetch public GitHub activity for one user and write a JSON snapshot that build.mjs turns into SVGs.
// Zero dependencies. Node >= 20.  Usage:  GITHUB_TOKEN=… node scripts/fetch.mjs [login] [out.json]
// Only public data is requested, so the result is identical whether it runs with the repo-scoped Actions token or a personal one.

import fs from 'node:fs';
import path from 'node:path';

const LOGIN = process.argv[2] || 'Aanishnithin07';
const OUT = process.argv[3] || path.join('data', 'profile.json');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN is required'); process.exit(1); }
const TZ_OFFSET_MIN = 330; // IST — the author's home timezone, used for the commit clock
const UA = `${LOGIN}-profile-builder`;

// Facts that are not available from the API (kept here, in one place, so they are easy to edit).
const STATIC = {
  email: 'aanishnithin07@gmail.com',
  timezone: 'Asia/Kolkata (UTC+05:30)',
  education: [
    'B.Tech Computer Science & Engineering, SRM Institute of Science & Technology (CGPA 9.45)',
    'BA (Hons) Psychology, IGNOU',
  ],
  book: {
    title: 'Inside HR: The Unspoken Rules of Recruitment and Career Growth',
    year: 2025,
    url: 'https://www.amazon.in/dp/B0FR1WS8SK',
    note: 'self-published; author, illustrator and editor',
  },
};

const headers = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': UA, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
  return json.data;
}
async function rest(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`REST ${res.status} ${url}: ${await res.text()}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERY = `query($login:String!) {
  user(login:$login) {
    name login bio location websiteUrl twitterUsername createdAt pronouns avatarUrl
    socialAccounts(first:10){ nodes{ provider url displayName } }
    followers{ totalCount } following{ totalCount }
    pinnedItems(first:6, types:[REPOSITORY]) { nodes { ... on Repository { name } } }
    repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, orderBy:{field:PUSHED_AT, direction:DESC}) {
      totalCount
      nodes {
        name description homepageUrl url isArchived isPrivate stargazerCount forkCount pushedAt createdAt
        primaryLanguage{ name color }
        repositoryTopics(first:10){ nodes{ topic{ name } } }
        languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } }
        defaultBranchRef { target { ... on Commit { history(first:1){ totalCount nodes{ committedDate messageHeadline } } } } }
      }
    }
    contributionsCollection {
      totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions totalRepositoryContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount weekday } } }
    }
    repositoriesContributedTo(first:30, contributionTypes:[COMMIT,PULL_REQUEST], includeUserRepositories:false, privacy:PUBLIC){ totalCount nodes{ nameWithOwner isPrivate stargazerCount } }
  }
}`;

// --- commit clock: author timestamps of public commits, converted to IST -------------------------------
async function commitRhythm(previous) {
  const byHour = new Array(24).fill(0), byWeekdayMonFirst = new Array(7).fill(0);
  let fetched = 0, total = 0;
  try {
    for (let page = 1; page <= 10; page++) {
      const q = encodeURIComponent(`author:${LOGIN} is:public`);
      const data = await rest(`https://api.github.com/search/commits?q=${q}&sort=author-date&order=desc&per_page=100&page=${page}`);
      total = data.total_count;
      for (const it of data.items) {
        const t = Date.parse(it.commit.author.date); // absolute instant
        if (Number.isNaN(t)) continue;
        const local = new Date(t + TZ_OFFSET_MIN * 60_000); // shift, then read UTC fields as IST wall-clock
        byHour[local.getUTCHours()]++;
        byWeekdayMonFirst[(local.getUTCDay() + 6) % 7]++;
        fetched++;
      }
      if (data.items.length < 100 || fetched >= total) break;
      await sleep(2500); // search API: 30 requests/minute
    }
    return { source: `GitHub commit search, public repos only, author time converted to IST, last ${fetched} of ${total} commits`, sampled: fetched, byHour, byWeekdayMonFirst };
  } catch (e) {
    console.warn('commit search failed, keeping previous rhythm:', e.message);
    return previous || { source: 'unavailable', sampled: 0, byHour, byWeekdayMonFirst };
  }
}

// --- homepage liveness (so the README never links to a dead deploy) -----------------------------------
async function isLive(url) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12_000);
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; profile-readme-link-check)' } });
    clearTimeout(t);
    return res.status >= 200 && res.status < 400;
  } catch { return false; }
}

// --- main ---------------------------------------------------------------------------------------------
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const u = (await graphql(QUERY, { login: LOGIN })).user;
const cc = u.contributionsCollection;
const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));

let best = 0, run = 0;
for (const d of days) { run = d.count > 0 ? run + 1 : 0; best = Math.max(best, run); }
let i = days.length - 1, cur = 0;
if (days[i].count === 0) i--; // today may still be empty
while (i >= 0 && days[i].count > 0) { cur++; i--; }

const langBytes = new Map(), langColor = new Map();
for (const r of u.repositories.nodes) for (const e of r.languages.edges) { langBytes.set(e.node.name, (langBytes.get(e.node.name) || 0) + e.size); langColor.set(e.node.name, e.node.color); }
const langTotal = [...langBytes.values()].reduce((a, b) => a + b, 0);
const languages = [...langBytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, bytes]) => ({ name, pct: Math.round((1000 * bytes) / langTotal) / 10, color: langColor.get(name) }));

const repos = [];
for (const r of u.repositories.nodes) {
  if (r.isPrivate) continue; // belt and braces: the query already asks for PUBLIC only
  const h = r.defaultBranchRef?.target?.history;
  repos.push({
    name: r.name, description: (r.description || '').trim(), homepage: r.homepageUrl || '', url: r.url, archived: r.isArchived,
    stars: r.stargazerCount, forks: r.forkCount, pushedAt: r.pushedAt, createdAt: r.createdAt,
    language: r.primaryLanguage?.name ?? null, languageColor: r.primaryLanguage?.color ?? null,
    topics: r.repositoryTopics.nodes.map((t) => t.topic.name), commits: h?.totalCount ?? 0, lastCommit: h?.nodes?.[0]?.messageHeadline ?? null,
  });
}
await Promise.all(repos.filter((r) => r.homepage).map(async (r) => { r.homepageLive = await isLive(r.homepage); }));

const data = {
  generatedAt: new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10), // today's date in IST
  profile: {
    name: u.name, login: u.login, pronouns: u.pronouns || null, bio: (u.bio || '').trim(), location: u.location, timezone: STATIC.timezone,
    website: u.websiteUrl, twitter: u.twitterUsername ? `https://x.com/${u.twitterUsername}` : null,
    linkedin: u.socialAccounts.nodes.find((s) => s.provider === 'LINKEDIN')?.url ?? null,
    email: STATIC.email, avatar: u.avatarUrl, createdAt: u.createdAt, followers: u.followers.totalCount, following: u.following.totalCount,
    education: STATIC.education, book: STATIC.book,
  },
  pinned: u.pinnedItems.nodes.map((p) => p.name),
  repos, languages,
  contributions: {
    windowStart: days[0].date, windowEnd: days[days.length - 1].date, total: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions, pullRequests: cc.totalPullRequestContributions, issues: cc.totalIssueContributions,
    reposCreated: cc.totalRepositoryContributions, currentStreak: cur, longestStreak: best, days,
  },
  commitRhythm: await commitRhythm(previous?.commitRhythm),
  contributedTo: u.repositoriesContributedTo.nodes.filter((n) => !n.isPrivate).map((n) => n.nameWithOwner),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${OUT}: ${repos.length} repos, ${data.contributions.total} contributions, streak ${cur}/${best}, rhythm sample ${data.commitRhythm.sampled}`);
