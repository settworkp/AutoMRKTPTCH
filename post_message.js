const puppeteer = require('puppeteer');
const fs = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const rawCookies = process.env.PATCHED_COOKIES;
const message = process.env.MARKETPLACE_MESSAGE || config.message;

if (!rawCookies) { console.error('❌ PATCHED_COOKIES secret manquant !'); process.exit(1); }
if (!message)    { console.error('❌ Message manquant !'); process.exit(1); }

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  // 1. Injection des cookies
  console.log('🍪 Injection des cookies...');
  const cookies = parseCookies(rawCookies);
  await page.setCookie(...cookies);
  console.log(`   ${cookies.length} cookie(s) injecté(s).`);

  // 2. Charger la homepage
  console.log(`🌐 Navigation vers ${config.target_url} ...`);
  await page.goto(config.target_url, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(config.timing.page_load_wait);

  // 3. Vérifier la connexion
  const loggedIn = await page.evaluate(() => !!document.querySelector('a[href*="usercp.php"], a[href*="logout"]'));
  if (!loggedIn) { console.error('❌ Non connecté ! Vérifie tes cookies.'); await browser.close(); process.exit(1); }
  console.log('✅ Connecté au compte.');

  // 4. Cliquer sur Marketplace
  console.log("🛒 Clic sur l'onglet Marketplace...");
  await page.waitForSelector(config.selectors.marketplace_tab, { timeout: 10000 });
  await page.click(config.selectors.marketplace_tab);
  await wait(config.timing.after_tab_click);

  // 5. Saisir le message (div contenteditable)
  console.log('✏️  Saisie du message...');
  await page.waitForSelector(config.selectors.chat_input, { timeout: 10000 });
  await page.click(config.selectors.chat_input);
  await page.evaluate((sel, txt) => {
    const el = document.querySelector(sel);
    el.focus();
    el.innerText = txt;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, config.selectors.chat_input, message);
  await wait(config.timing.after_type);

  // 6. Envoyer
  console.log('📤 Envoi du message...');
  await page.waitForSelector(config.selectors.send_button, { timeout: 10000 });
  await page.click(config.selectors.send_button);
  await wait(config.timing.after_send);

  await page.screenshot({ path: 'result.png', fullPage: false });
  console.log('📸 Capture sauvegardée : result.png');
  console.log('✅ Message posté avec succès !');
  await browser.close();
})();
