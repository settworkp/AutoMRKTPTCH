const puppeteer = require('puppeteer');
const fs = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const rawCookies = process.env.PATCHED_COOKIES;
const message    = process.env.MARKETPLACE_MESSAGE || config.message;

if (!rawCookies) { console.error('❌ PATCHED_COOKIES secret manquant !'); process.exit(1); }
if (!message)    { console.error('❌ Message manquant !');                 process.exit(1); }

function wait(ms) {
  console.log(`   ⏳ Attente ${ms / 1000}s...`);
  return new Promise(r => setTimeout(r, ms));
}

function parseCookies(raw) {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
  } catch (_) {}
  return raw.split(';').map(pair => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain: 'patched.to', path: '/' };
  }).filter(c => c.name && c.value);
}

(async () => {
  console.log('🚀 Démarrage du navigateur...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: config.browser.viewport_width, height: config.browser.viewport_height });

  // ── ÉTAPE 1 : Injection des cookies ──────────────────────────────────────
  console.log('\n🍪 [ÉTAPE 1] Injection des cookies...');
  const cookies = parseCookies(rawCookies);
  await page.setCookie(...cookies);
  console.log(`   ${cookies.length} cookie(s) injecté(s).`);
  await wait(config.timing.after_cookies); // 20s

  // ── ÉTAPE 2 : Charger la homepage ─────────────────────────────────────────
  console.log(`\n🌐 [ÉTAPE 2] Navigation vers ${config.target_url} ...`);
  await page.goto(config.target_url, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(config.timing.page_load_wait); // 20s

  // Vérifier la connexion
  const loggedIn = await page.evaluate(() =>
    !!document.querySelector('a[href*="usercp.php"], a[href*="logout"]')
  );
  if (!loggedIn) {
    console.error('❌ Non connecté ! Vérifie tes cookies.');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✅ Connecté au compte.');

  // ── ÉTAPE 3 : Cliquer sur Marketplace ────────────────────────────────────
  console.log("\n🛒 [ÉTAPE 3] Clic sur l'onglet Marketplace...");
  await page.waitForSelector(config.selectors.marketplace_tab, { timeout: 15000 });
  await page.click(config.selectors.marketplace_tab);
  await wait(config.timing.after_tab_click); // 10s

  // ── ÉTAPE 4 : Saisir le message ───────────────────────────────────────────
  console.log('\n✏️  [ÉTAPE 4] Saisie du message...');
  await page.waitForSelector(config.selectors.chat_input, { timeout: 15000 });
  await page.click(config.selectors.chat_input);
  await page.evaluate((sel, txt) => {
    const el = document.querySelector(sel);
    el.focus();
    el.innerText = txt;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, config.selectors.chat_input, message);
  console.log('   Message saisi.');
  await wait(config.timing.after_type); // 5s

  // ── ÉTAPE 5 : Envoyer ─────────────────────────────────────────────────────
  console.log('\n📤 [ÉTAPE 5] Envoi du message...');
  await page.waitForSelector(config.selectors.send_button, { timeout: 15000 });
  await page.click(config.selectors.send_button);
  await wait(config.timing.after_send); // 5s

  await page.screenshot({ path: 'result.png', fullPage: false });
  console.log('\n📸 Capture sauvegardée : result.png');
  console.log('✅ Message posté avec succès !');
  await browser.close();
})();
