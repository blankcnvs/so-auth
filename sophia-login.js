const puppeteer = require('puppeteer');

async function getSophiaAuth(email, password) {
  let browser;
  
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false, // Set to true once it's working
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to login page...');
    await page.goto('https://app.sophia.org/user_sessions/new.html', {
      waitUntil: 'networkidle2'
    });

    // Wait for login form
    await page.waitForSelector('input[name="user_session[email]"]', { timeout: 10000 });
    
    console.log('Filling in credentials...');
    // Fill in email
    await page.type('input[name="user_session[email]"]', email, { delay: 100 });
    
    // Fill in password
    await page.type('input[name="user_session[password]"]', password, { delay: 100 });
    
    // Click sign in button
    console.log('Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    // Wait using the new syntax
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get all cookies
    const cookies = await page.cookies();
    console.log('All cookies:', cookies.map(c => c.name));

    // Extract the important cookies
    const authToken = cookies.find(c => c.name === 'auth_token');
    const sessionCookie = cookies.find(c => c.name === '_sophia_session');

    if (!authToken) {
      console.log('Warning: auth_token not found. Checking for JWT in page...');
      
      // Try navigating to home to trigger auth token
      console.log('Navigating to home page...');
      await page.goto('https://app.sophia.org/home', {
        waitUntil: 'networkidle2'
      });
      
      // Wait again
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check cookies again
      const cookiesAfterHome = await page.cookies();
      const authTokenAfterHome = cookiesAfterHome.find(c => c.name === 'auth_token');
      
      if (authTokenAfterHome) {
        console.log('Auth token found after navigating to home!');
        return {
          success: true,
          authToken: authTokenAfterHome.value,
          sessionCookie: sessionCookie ? sessionCookie.value : null,
          allCookies: cookiesAfterHome.map(c => ({ name: c.name, value: c.value })),
          currentUrl: page.url()
        };
      }
      
      // Sometimes the token might be in localStorage or sessionStorage
      const localStorage = await page.evaluate(() => Object.assign({}, window.localStorage));
      const sessionStorage = await page.evaluate(() => Object.assign({}, window.sessionStorage));
      
      console.log('LocalStorage:', localStorage);
      console.log('SessionStorage:', sessionStorage);
    }

    // Get current URL to verify login success
    const currentUrl = page.url();
    console.log('Current URL after login:', currentUrl);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'after-login.png' });

    await browser.close();

    return {
      success: !currentUrl.includes('sign_in'),
      authToken: authToken ? authToken.value : null,
      sessionCookie: sessionCookie ? sessionCookie.value : null,
      allCookies: cookies.map(c => ({ name: c.name, value: c.value })),
      currentUrl: currentUrl
    };

  } catch (error) {
    console.error('Error during login:', error);
    if (browser) await browser.close();
    throw error;
  }
}

// Function to create the full cookie string for n8n
function createCookieString(authResult) {
  if (!authResult.authToken || !authResult.sessionCookie) {
    throw new Error('Missing required cookies');
  }
  
  return `_sophia_session=${authResult.sessionCookie}; auth_token=${authResult.authToken}`;
}

// Main execution
async function main() {
  const email = 'malikmillerbusiness96.0@gmail.com';
  const password = 'Ashinabi12@';

  try {
    console.log('Starting Sophia authentication...');
    const result = await getSophiaAuth(email, password);
    
    console.log('\n=== RESULTS ===');
    console.log('Login successful:', result.success);
    console.log('Session Cookie:', result.sessionCookie);
    console.log('Auth Token:', result.authToken ? 'Found' : 'Not found');
    
    if (result.authToken && result.sessionCookie) {
      const cookieString = createCookieString(result);
      console.log('\n=== COOKIE STRING FOR N8N ===');
      console.log(cookieString);
      
      // Save to file for easy access
      const fs = require('fs');
      fs.writeFileSync('sophia-cookies.txt', cookieString);
      console.log('\nCookies saved to sophia-cookies.txt');
    } else {
      console.log('\n❌ Failed to get all required cookies');
      console.log('All cookies found:', result.allCookies);
    }
    
  } catch (error) {
    console.error('Failed:', error.message);
  }
}

// Run the script
main();