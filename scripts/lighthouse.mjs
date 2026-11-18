/* Lighthouse mobile: faz login real e mede index.html / dashboard.html.
   Uso: node scripts/lighthouse.mjs before|after [pagina] */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';

const fase = process.argv[2] || 'after';
const paginas = process.argv[3] ? [process.argv[3]] : ['index', 'dashboard'];

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8080';
const PORTA_CDP = 9223;
const REPORTS = path.resolve('reports');
fs.mkdirSync(REPORTS, { recursive: true });

const credenciais = {
  aluno: { matricula: '202604178821', destino: 'index.html' },
  coordenacao: { matricula: 'coord01', destino: 'dashboard.html' }
};

async function login(page, perfil) {
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#matricula', perfil.matricula);
  await page.type('#senha', 'senai123');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('#btnEntrar')
  ]);
  await page.waitForFunction(
    () => location.pathname.endsWith('index.html') || location.pathname.endsWith('dashboard.html'),
    { timeout: 30000 }
  ).catch(() => {});
  console.log('  login ->', page.url());
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    `--remote-debugging-port=${PORTA_CDP}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--window-size=412,915'
  ],
  defaultViewport: { width: 412, height: 915, deviceScaleFactor: 1.75 }
});

const page = await browser.newPage();

for (const nome of paginas) {
  const perfil = nome === 'dashboard' ? credenciais.coordenacao : credenciais.aluno;
  console.log(`\n[${nome}] autenticando como ${perfil.matricula}`);
  await login(page, perfil);

  const url = `${BASE}/${perfil.destino}`;
  const result = await lighthouse(url, {
    port: PORTA_CDP,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
  });

  const lhr = result.lhr;
  const m = (id) => lhr.audits[id]?.numericValue ?? null;
  const linhas = {
    fase,
    pagina: nome,
    url,
    data: new Date().toISOString(),
    performance: Math.round((lhr.categories.performance?.score || 0) * 100),
    accessibility: Math.round((lhr.categories.accessibility?.score || 0) * 100),
    bestPractices: Math.round((lhr.categories['best-practices']?.score || 0) * 100),
    seo: Math.round((lhr.categories.seo?.score || 0) * 100),
    FCP: m('first-contentful-paint'),
    LCP: m('largest-contentful-paint'),
    CLS: m('cumulative-layout-shift'),
    TBT: m('total-blocking-time'),
    SI: m('speed-index')
  };

  const arquivo = path.join(REPORTS, `lh-${fase}-${nome}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(lhr, null, 2));
  fs.writeFileSync(path.join(REPORTS, `resumo-${fase}-${nome}.json`), JSON.stringify(linhas, null, 2));

  console.log(`  perf=${linhas.performance} a11y=${linhas.accessibility} bp=${linhas.bestPractices} seo=${linhas.seo}`);
  console.log(`  FCP=${Math.round(linhas.FCP)}ms LCP=${Math.round(linhas.LCP)}ms CLS=${linhas.CLS.toFixed(3)} TBT=${Math.round(linhas.TBT)}ms`);
}

await browser.close();
