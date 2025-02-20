// linkedinActions.js
const puppeteer = require('puppeteer');

const LINKEDIN_SESSION_COOKIE = process.env.LINKEDIN_SESSION_COOKIE;
const USER_AGENT = process.env.USER_AGENT;

async function safeClick(selector, page) {
  try {
    const element = await page.waitForSelector(selector, { timeout: 10000 });
    await element.click();
    console.log(`Successfully clicked element: ${selector}`);
    return true;
  } catch (error) {
    if (error.message.includes('timeout')) {
      console.log(`Element not found - possible UI change: ${selector}`);
    }
    console.log(`Error clicking element: ${selector} (${error.message})`);
    return false;
  }
}

async function launchBrowser() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // set to false for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  console.log('Browser launched successfully');
  
  // Set LinkedIn session cookie
  await page.setCookie({
    name: 'li_at',
    value: LINKEDIN_SESSION_COOKIE,
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
  });
  console.log('LinkedIn session cookie set');
  return { browser, page };
}

async function sendConnectionRequest(profileUrl, messageTemplate = '') {
    console.log(`Sending connection request to: ${profileUrl}`);
    const { browser, page } = await launchBrowser();
    try {
      console.log('Attempting to navigate to profile...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.goto(profileUrl)
      ]);
      
      // Make sure the page is ready before proceeding
      await page.waitForSelector('body', { timeout: 5000 });
      
      // Verify we landed on the correct page
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        throw new Error('Redirected to login/checkpoint page');
      }
      
      console.log('Navigation successful');

      // Check if already connected or pending by looking for Message button
      const messageButtonSelector = 'button.artdeco-button--primary[aria-label^="Message"]';
      const isAlreadyConnected = await page.$(messageButtonSelector) !== null;
      
      if (isAlreadyConnected) {
        console.log('Already connected or connection pending with this profile');
        await browser.close();
        return { profileUrl, status: 'Already connected/pending' };
      }
      
      // Continue with connection request if not already connected...
      const connectButtonSelector = 'button[aria-label^="Invite"].artdeco-button:not(.pvs-sticky-header-profile-actions__action)';
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
        safeClick(connectButtonSelector, page)
      ]);

      // Check if connection dialog opened
      if (!await page.$('button[aria-label="Add a note"]') && 
          !await page.$('button[aria-label="Send without a note"]')) {
        throw new Error('Failed to open connection dialog');
      }
  
      // If a custom message is provided, add a note. Otherwise, send without note
      if (messageTemplate && messageTemplate.trim() !== '') {
        console.log('Adding custom note to connection request...');
        const addNoteSelector = 'button[aria-label="Add a note"]';
        if (!await safeClick(addNoteSelector, page)) {
          throw new Error('Failed to click Add note button');
        }

        const messageSelector = 'textarea[name="message"]';
        await page.waitForSelector(messageSelector, { timeout: 8000 });
        await page.type(messageSelector, messageTemplate, { delay: 50 });
        console.log('Custom note added successfully');
        
        // Use Send invitation button when sending with note
        const sendButtonSelector = 'button[aria-label="Send invitation"]';
        console.log('Sending the connection request with the following message: ', messageTemplate);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }).catch((error) => {
            console.log('Error waiting for navigation:', error.message);
          }),
          safeClick(sendButtonSelector, page)
        ]);
      } else {
        // Send without note
        console.log('Sending connection request without note');
        const sendWithoutNoteSelector = 'button[aria-label="Send without a note"]';
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }).catch((error) => {
            console.log('Error waiting for navigation:', error.message);
          }),
          safeClick(sendWithoutNoteSelector, page)
        ]);
      }
      
      console.log('Connection request sent successfully');
      
      // Brief pause before closing
      await new Promise(resolve => setTimeout(resolve, 1000));
      await browser.close();
      return { profileUrl, status: 'Invitation sent' };
    } catch (error) {
      console.error('Error sending connection request:', error.message);
      await browser.close();
      throw error;
    }
}

async function sendMessage(profileUrl, message) {
    console.log(`Sending message to: ${profileUrl}`);
    const { browser, page } = await launchBrowser();
    try {
      console.log('Attempting to navigate to profile...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.goto(profileUrl)
      ]);
      
      // Make sure the page is ready before proceeding
      await page.waitForSelector('body', { timeout: 5000 });
      
      // Verify we landed on the correct page
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
        throw new Error('Redirected to login/checkpoint page');
      }
      
      console.log('Navigation successful');
      
      // Click Message button
      const messageButtonSelector = 'button[data-control-name="message"]';
      if (!await safeClick(messageButtonSelector, page)) {
        throw new Error('Failed to click Message button');
      }
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
      
      // Type and send message
      console.log('Opening message dialog...');
      const textareaSelector = 'div.msg-form__contenteditable';
      await page.waitForSelector(textareaSelector, { timeout: 10000 });
      await page.click(textareaSelector);
      await page.keyboard.type(message, { delay: 50 });
      
      const sendButtonSelector = 'button.msg-form__send-button';
      if (!await safeClick(sendButtonSelector, page)) {
        throw new Error('Failed to click Send button');
      }
      
      console.log('Message sent successfully');
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));
      await browser.close();
      return { profileUrl, status: 'Message sent' };
    } catch (error) {
      console.error('Error sending message:', error.message);
      await browser.close();
      throw error;
    }
}

async function checkConnectionStatus(profileUrl) {
    console.log(`Checking connection status for: ${profileUrl}`);
    const { browser, page } = await launchBrowser();
    try {
      await page.goto(profileUrl, { waitUntil: 'networkidle2' });
      
      const messageButtonSelector = 'button[data-control-name="message"]';
      const isConnected = await page.$(messageButtonSelector) !== null;
      
      console.log(`Connection status: ${isConnected ? 'Accepted' : 'Pending'}`);
      await browser.close();
      return isConnected ? 'Accepted' : 'Pending';
    } catch (error) {
      console.error('Error checking connection status:', error.message);
      await browser.close();
      throw error;
    }
}
  
module.exports = {
  sendConnectionRequest,
  sendMessage,
  checkConnectionStatus,
};
  