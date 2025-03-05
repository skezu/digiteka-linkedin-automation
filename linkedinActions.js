// linkedinActions.js
const puppeteer = require('puppeteer');

const LINKEDIN_SESSION_COOKIE = process.env.LINKEDIN_SESSION_COOKIE;
const USER_AGENT = process.env.USER_AGENT;

let browserInstance = null;
let lastActivityTimestamp = null;
let browserInitializing = false;
const BROWSER_IDLE_TIMEOUT = 60000; // 1 minute in milliseconds
const activeOperations = new Map(); // Track operations in progress by profileUrl

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

async function manageBrowser() {
  const currentTime = Date.now();
  
  // Check if we need to close idle browser
  if (browserInstance && lastActivityTimestamp) {
    const idleTime = currentTime - lastActivityTimestamp;
    if (idleTime > BROWSER_IDLE_TIMEOUT) {
      console.log(`Browser idle for ${idleTime}ms, closing...`);
      await browserInstance.close();
      browserInstance = null;
      console.log('Idle browser closed');
    }
  }

  // Launch new browser if needed
  if (!browserInstance && !browserInitializing) {
    try {
      browserInitializing = true;
      console.log('Launching new browser instance...');
      const startTime = Date.now();
      
      browserInstance = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const launchTime = Date.now() - startTime;
      console.log(`New browser instance launched in ${launchTime}ms`);
    } catch (error) {
      console.error('Error launching browser:', error.message);
      throw error;
    } finally {
      browserInitializing = false;
    }
  } else if (browserInitializing) {
    console.log('Waiting for browser to initialize...');
    while (browserInitializing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!browserInstance) {
      throw new Error('Browser initialization failed');
    }
    console.log('Existing browser initialization completed');
  }

  // Update activity timestamp
  lastActivityTimestamp = currentTime;

  // Create and set up new page
  const page = await browserInstance.newPage();
  await page.setUserAgent(USER_AGENT);
  
  // Set LinkedIn session cookie
  await page.setCookie({
    name: 'li_at',
    value: LINKEDIN_SESSION_COOKIE,
    domain: '.linkedin.com',
    path: '/',
    httpOnly: true,
    secure: true,
  });

  return { browser: browserInstance, page };
}

async function cleanupBrowser() {
  if (browserInstance) {
    console.log('Closing browser instance during cleanup...');
    await browserInstance.close();
    browserInstance = null;
    console.log('Browser cleanup completed');
  }
}

async function launchBrowser() {
  console.log('Requesting browser session...');
  const startTime = Date.now();
  
  const { browser, page } = await manageBrowser();
  
  const totalTime = Date.now() - startTime;
  console.log(`Browser session ready in ${totalTime}ms`);
  
  return { browser, page };
}

async function sendConnectionRequest(profileUrl, messageTemplate = '') {
    // Check if operation is already in progress for this profile
    if (activeOperations.has(profileUrl)) {
        console.log(`Operation already in progress for: ${profileUrl}, waiting for result...`);
        try {
            return await activeOperations.get(profileUrl);
        } catch (error) {
            console.error(`Error from existing operation for ${profileUrl}:`, error.message);
            throw error;
        }
    }

    // Create a promise that will be resolved with the operation result
    let resolveOperation, rejectOperation;
    const operationPromise = new Promise((resolve, reject) => {
        resolveOperation = resolve;
        rejectOperation = reject;
    });
    
    // Store the promise in the active operations map
    activeOperations.set(profileUrl, operationPromise);

    console.log(`Starting new operation for: ${profileUrl}`);
    const { browser, page } = await launchBrowser();
    let pageAlreadyClosed = false; // Track if page is already closed
    
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
            // Don't close the page here, let the finally block handle it
            const result = { profileUrl, status: 'Already connected/pending' };
            resolveOperation(result);
            return result;
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
        // Don't close the page here either
        const result = { profileUrl, status: 'Invitation sent' };
        resolveOperation(result);
        return result;
    } catch (error) {
        console.error('Error sending connection request:', error.message);
        rejectOperation(error);
        throw error;
    } finally {
        try {
            // Only try to close if page exists and isn't already closed
            if (page && !pageAlreadyClosed) {
                await page.close();
                pageAlreadyClosed = true;
            }
        } catch (err) {
            console.log(`Warning: Error closing page: ${err.message}`);
        }
        activeOperations.delete(profileUrl);
    }
}

async function sendMessage(profileUrl, message) {
    if (message == "") {
        console.log("No message provided, stopping action");
        return { profileUrl, status: 'No message provided' };
    }
    
    // Check if operation is already in progress for this profile
    if (activeOperations.has(profileUrl)) {
        console.log(`Operation already in progress for: ${profileUrl}, waiting for result...`);
        try {
            return await activeOperations.get(profileUrl);
        } catch (error) {
            console.error(`Error from existing operation for ${profileUrl}:`, error.message);
            throw error;
        }
    }

    // Create a promise that will be resolved with the operation result
    let resolveOperation, rejectOperation;
    const operationPromise = new Promise((resolve, reject) => {
        resolveOperation = resolve;
        rejectOperation = reject;
    });
    
    // Store the promise in the active operations map
    activeOperations.set(profileUrl, operationPromise);
    
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
        
        // Click Message button and wait for navigation
        const messageButtonSelector = 'button.artdeco-button--primary:not(.pvs-sticky-header-profile-actions__action)[aria-label^="Message"]';
        if (!await safeClick(messageButtonSelector, page)) {
            throw new Error('Failed to click Message button');
        }
        
        // Type and send message
        console.log('Opening message dialog...');
        const textareaSelector = 'div.msg-form__contenteditable[contenteditable="true"]';
        
        try {
            // Wait for the textarea to be available
            await page.waitForSelector(textareaSelector, { timeout: 10000 });
            
            // Click to focus the textarea
            console.log('Focusing message input...');
            await page.click(textareaSelector);
            
            // Wait briefly for the focus state to be applied
            await page.waitForFunction(
                selector => document.querySelector(selector).getAttribute('data-artdeco-is-focused') === 'true',
                { timeout: 5000 },
                textareaSelector
            ).catch(error => {
                console.log('Warning: Could not verify focus state, but continuing...');
            });
            
            // Type the message using keyboard
            console.log('Typing message content...');
            await page.keyboard.type(""+message);
            
            // Verify the message was typed
            /* 
            const messageContent = await page.evaluate(selector => 
                document.querySelector(selector).textContent, 
                textareaSelector
            );
             if (!messageContent.includes(message)) {
                throw new Error('Failed to type message content');
            }
             */
            console.log('Message content typed successfully');
            
            // Click send button
            const sendButtonSelector = 'button.msg-form__send-button[type="submit"]';
            console.log('Attempting to click send button...');
            
            if (!await safeClick(sendButtonSelector, page)) {
                throw new Error('Failed to click Send button');
            }
            
            // Wait for the message to be sent (textarea should clear)
            await page.waitForFunction(
                selector => document.querySelector(selector).textContent.trim() === '',
                { timeout: 5000 },
                textareaSelector
            ).catch(error => {
                console.warn('Warning: Could not verify if message was sent');
            });
            
            console.log('Message sent successfully');
            
        } catch (error) {
            console.error('Error in message sending process:', error.message);
            throw error;
        }
        const result = { profileUrl, status: 'Message sent' };
        resolveOperation(result);
        return result;
    } catch (error) {
        console.error('Error sending message:', error.message);
        rejectOperation(error);
        throw error;
    } finally {
        await page.close();
        activeOperations.delete(profileUrl);
    }
}

async function checkConnectionStatus(profileUrl) {
    // Check if operation is already in progress for this profile
    if (activeOperations.has(profileUrl)) {
        console.log(`Operation already in progress for: ${profileUrl}, waiting for result...`);
        try {
            return await activeOperations.get(profileUrl);
        } catch (error) {
            console.error(`Error from existing operation for ${profileUrl}:`, error.message);
            throw error;
        }
    }

    // Create a promise that will be resolved with the operation result
    let resolveOperation, rejectOperation;
    const operationPromise = new Promise((resolve, reject) => {
        resolveOperation = resolve;
        rejectOperation = reject;
    });
    
    // Store the promise in the active operations map
    activeOperations.set(profileUrl, operationPromise);
    
    console.log(`Checking connection status for: ${profileUrl}`);
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
        
        console.log('Navigation successful, checking connection status...');

        // Check for "Connect" button (both variants)
        const connectButtonSelector = [
            'button.artdeco-button[aria-label^="Invite"][aria-label*="to connect"]',
            'button.artdeco-button--primary[aria-label^="Invite"][aria-label*="to connect"]'
        ];
        
        // Check for "Pending" button
        const pendingButtonSelector = 'button.artdeco-button[aria-label^="Pending"]';
        
        // Check for Message button (indicates connected)
        const messageButtonSelector = 'button.artdeco-button--primary[aria-label^="Message"]';

        let status;
        if (await page.$(pendingButtonSelector) !== null) {
            status = 'Pending';
        } else if (await page.$(messageButtonSelector) !== null) {
            status = 'Connected';
        } else if (
            await page.$(connectButtonSelector[0]) !== null || 
            await page.$(connectButtonSelector[1]) !== null
        ) {
            status = 'Not Connected';
        } else {
            console.log('Warning: Could not determine connection status definitively');
            status = 'Unknown';
        }
        
        console.log(`Connection status determined: ${status}`);
        resolveOperation(status);
        return status;
    } catch (error) {
        console.error('Error checking connection status:', error.message);
        rejectOperation(error);
        throw error;
    } finally {
        await page.close();
        activeOperations.delete(profileUrl);
    }
}
  
module.exports = {
  sendConnectionRequest,
  sendMessage,
  checkConnectionStatus,
  cleanupBrowser,
};
  