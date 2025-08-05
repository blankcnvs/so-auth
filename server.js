const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

async function getSophiaAuth(email, password) {
  let browser;
  
  try {
    // Connect to browserless.io
    browser = await puppeteer.connect({
      browserWSEndpoint: 'wss://chrome.browserless.io?token=2SoCBbU0Bpf6vEec1281a3abe2ce8d3293628efa00491a583'
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Navigating to login page...');
    await page.goto('https://app.sophia.org/user_sessions/new.html', {
      waitUntil: 'networkidle2'
    });

    await page.waitForSelector('input[name="user_session[email]"]', { timeout: 10000 });
    await page.type('input[name="user_session[email]"]', email, { delay: 100 });
    await page.type('input[name="user_session[password]"]', password, { delay: 100 });
    
    console.log('Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const cookies = await page.cookies();
    const authToken = cookies.find(c => c.name === 'auth_token');
    const sessionCookie = cookies.find(c => c.name === '_sophia_session');

    await browser.close();

    if (authToken && sessionCookie) {
      return {
        success: true,
        cookieString: `_sophia_session=${sessionCookie.value}; auth_token=${authToken.value}`,
        authToken: authToken.value,
        sessionCookie: sessionCookie.value
      };
    }

    throw new Error('Failed to get required cookies');

  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

// Cache for cookies
const cookieCache = new Map();
const CACHE_DURATION = 25 * 60 * 1000; // 25 minutes

// API endpoint
app.post('/get-sophia-cookies', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check cache first
    const cacheKey = email;
    const cached = cookieCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Returning cached cookies');
      return res.json(cached.data);
    }

    console.log('Getting fresh cookies...');
    const result = await getSophiaAuth(email, password);
    
    // Cache the result
    cookieCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    res.json(result);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Sophia Auth Service Running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});