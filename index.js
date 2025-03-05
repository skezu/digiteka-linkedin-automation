// index.js
require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const { sendConnectionRequest, sendMessage, checkConnectionStatus, cleanupBrowser } = require('./linkedinActions');

app.use(express.json());

// Endpoint: Send Connection Request
app.post('/send-connection-request', async (req, res) => {
  const { profileUrl, messageTemplate } = req.body;
  try {
    const result = await sendConnectionRequest(profileUrl, messageTemplate);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error sending connection request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Send Message
app.post('/send-message', async (req, res) => {
  const { profileUrl, message } = req.body;
  try {
    const result = await sendMessage(profileUrl, message);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Check Connection Status
app.get('/check-connection-status', async (req, res) => {
  const { profileUrl } = req.query;
  try {
    const status = await checkConnectionStatus(profileUrl);
    res.status(200).json({ success: true, status });
  } catch (error) {
    console.error('Error checking connection status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`LinkedIn Automation API running on port ${port}`);
});

// Add cleanup handlers
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Performing cleanup...');
  await cleanupBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Performing cleanup...');
  await cleanupBrowser();
  process.exit(0);
});

// Optional: cleanup on uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await cleanupBrowser();
  process.exit(1);
});
