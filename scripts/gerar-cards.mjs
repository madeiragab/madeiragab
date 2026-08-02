/**
 * gerar-cards.mjs
 * ---------------
 * Gera os cards de estatísticas do perfil como SVGs estáticos, no tema
 * vermelho/preto/branco, e grava em assets/.
 *
 * Por que não usar github-readme-stats: a instância pública vive
 * retornando 503, o que deixaria o perfil com imagens quebradas. Gerando
 * aqui, o card sempre renderiza e sai exatamente na paleta do projeto.
 *
 * Roda diariamente via .github/workflows/atualizar-cards.yml
 *
 * Env: GITHUB_TOKEN (fornecido pelo Actions), GH_USER
 */

import { writeFile, mkdir } from 'node:fs/promises';

const TOKEN = process.env.GITHUB_TOKEN;
const USER = process.env.GH_USER || 'madeiragab';

if (!TOKEN) {
  console.error('GITHUB_TOKEN não definido.');
  process.exit(1);
}

/* ---------- paleta ---------- */
const C = {
  bg: '#0A0A0A',
  border: '#2A2A2A',
  red: '#FF2E3F',
  redDark: '#C1121F',
  text: '#FFFFFF',
  dim: '#9A9A9A',
};

/* ---------- consulta ---------- */
const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalRepositoriesWithContributedCommits
        contributionCalendar { totalContributions }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          name
          stargazerCount
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': USER,
  },
  body: JSON.stringify({ query, variables: { login: USER } }),
});

if (!res.ok) {
  console.error(`GraphQL falhou: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const json = await res.json();
if (json.errors) {
  console.error('GraphQL retornou erros:', JSON.stringify(json.errors));
  process.exit(1);
}

const u = json.data.user;
const cc = u.contributionsCollection;
const repos = u.repositories.nodes;

const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);

/* ---------- agrega linguagens ---------- */
const porLingua = new Map();
for (const r of repos) {
  for (const e of r.languages.edges) {
    const atual = porLingua.get(e.node.name) || { size: 0, color: e.node.color };
    atual.size += e.size;
    porLingua.set(e.node.name, atual);
  }
}
const totalBytes = [...porLingua.values()].reduce((s, l) => s + l.size, 0) || 1;
const linguas = [...porLingua.entries()]
  .map(([nome, l]) => ({ nome, pct: (l.size / totalBytes) * 100, cor: l.color || C.red }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 6);

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const FONTE = "'JetBrains Mono','Cascadia Code',Consolas,ui-monospace,monospace";

function moldura(largura, altura, titulo) {
  return `
  <defs>
    <linearGradient id="borda" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.red}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${C.border}" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${largura - 1}" height="${altura - 1}" rx="12"
        fill="${C.bg}" stroke="url(#borda)" stroke-width="1.5"/>
  <text x="25" y="35" font-family="${FONTE}" font-size="16" font-weight="700"
        fill="${C.red}">${esc(titulo)}</text>
  <rect x="25" y="45" width="34" height="2.5" rx="1.25" fill="${C.red}"/>`;
}

/* ---------- textos por idioma ----------
   Os cards são gerados em PT e EN: o README.md usa os arquivos sem
   sufixo, o README.en.md usa os terminados em .en.svg */
const TEXTOS = {
  pt: {
    stats: {
      aria: `Estatísticas do GitHub de ${USER}`,
      titulo: `${USER} :: github stats`,
      estrelas: 'Estrelas recebidas',
      commits: 'Commits (último ano)',
      prs: 'Pull requests',
      issues: 'Issues abertas',
      repos: 'Repositórios públicos',
      contribuicoes: 'Contribuições (ano)',
    },
    langs: {
      aria: `Linguagens mais usadas por ${USER}`,
      titulo: 'linguagens mais usadas',
    },
  },
  en: {
    stats: {
      aria: `GitHub statistics for ${USER}`,
      titulo: `${USER} :: github stats`,
      estrelas: 'Stars earned',
      commits: 'Commits (last year)',
      prs: 'Pull requests',
      issues: 'Issues opened',
      repos: 'Public repositories',
      contribuicoes: 'Contributions (year)',
    },
    langs: {
      aria: `Most used languages by ${USER}`,
      titulo: 'most used languages',
    },
  },
};

/* ---------- card 1: estatísticas ---------- */
function cardStats(t) {
  const linhas = [
    [t.estrelas, stars],
    [t.commits, cc.totalCommitContributions],
    [t.prs, cc.totalPullRequestContributions],
    [t.issues, cc.totalIssueContributions],
    [t.repos, u.repositories.totalCount],
    [t.contribuicoes, cc.contributionCalendar.totalContributions],
  ];

  const L1 = 460;
  const A1 = 90 + linhas.length * 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L1}" height="${A1}" viewBox="0 0 ${L1} ${A1}" role="img" aria-label="${esc(t.aria)}">
${moldura(L1, A1, t.titulo)}
${linhas.map(([rotulo, valor], i) => {
  const y = 82 + i * 30;
  return `  <text x="25" y="${y}" font-family="${FONTE}" font-size="13" fill="${C.dim}">${esc(rotulo)}</text>
  <text x="${L1 - 25}" y="${y}" font-family="${FONTE}" font-size="15" font-weight="700"
        fill="${C.text}" text-anchor="end">${valor}</text>`;
}).join('\n')}
</svg>
`;
}

/* ---------- card 2: linguagens ---------- */
function cardLangs(t) {
  const L2 = 460;
  const A2 = 90 + linguas.length * 34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L2}" height="${A2}" viewBox="0 0 ${L2} ${A2}" role="img" aria-label="${esc(t.aria)}">
${moldura(L2, A2, t.titulo)}
${linguas.map((l, i) => {
  const y = 76 + i * 34;
  const larguraBarra = L2 - 50;
  const preenchida = Math.max(4, (l.pct / 100) * larguraBarra);
  return `  <text x="25" y="${y}" font-family="${FONTE}" font-size="12.5" fill="${C.text}">${esc(l.nome)}</text>
  <text x="${L2 - 25}" y="${y}" font-family="${FONTE}" font-size="12" fill="${C.dim}"
        text-anchor="end">${l.pct.toFixed(1)}%</text>
  <rect x="25" y="${y + 7}" width="${larguraBarra}" height="7" rx="3.5" fill="#1A1A1A"/>
  <rect x="25" y="${y + 7}" width="${preenchida.toFixed(1)}" height="7" rx="3.5" fill="${esc(l.cor)}"/>`;
}).join('\n')}
</svg>
`;
}

/* ---------- grava ---------- */
await mkdir('assets', { recursive: true });

await writeFile('assets/stats.svg', cardStats(TEXTOS.pt.stats));
await writeFile('assets/languages.svg', cardLangs(TEXTOS.pt.langs));
await writeFile('assets/stats.en.svg', cardStats(TEXTOS.en.stats));
await writeFile('assets/languages.en.svg', cardLangs(TEXTOS.en.langs));

console.log(`OK — ${stars} estrelas, ${cc.totalCommitContributions} commits, ${linguas.length} linguagens. 4 cards gravados (pt + en).`);
