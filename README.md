Certainly! Let's break down the project and create a comprehensive documentation for it.

---

# LinkedIn Automation API

## Overview

The LinkedIn Automation API is a server-side application designed to automate outreach activities on LinkedIn. It provides endpoints to send connection requests, send messages, and check connection statuses on LinkedIn profiles. This server is intended to be used in conjunction with an n8n workflow, which orchestrates these API calls to perform automated LinkedIn outreach.

## Project Structure

- **linkedin-automation-api/linkedinActions.js**: Contains the core logic for interacting with LinkedIn using Puppeteer, a headless browser automation library.
- **linkedin-automation-api/index.js**: Sets up the Express server and defines the API endpoints.

## Key Features

1. **Send Connection Requests**: Automatically sends connection requests to specified LinkedIn profiles, optionally including a custom message.
2. **Send Messages**: Sends follow-up messages to LinkedIn connections.
3. **Check Connection Status**: Checks whether a connection request is pending, accepted, or not sent.

## How It Works

### Puppeteer Integration

The application uses Puppeteer to automate browser actions on LinkedIn. It manages a single browser instance to optimize performance and reduce resource usage. The browser is launched when needed and closed after a period of inactivity.

### Request Handling

- **Queue System**: Operations are queued per profile URL to ensure that actions are performed sequentially for the same profile, preventing duplicate actions.
- **Promise-Based Operations**: Each operation returns a promise that resolves when the action is completed, allowing for asynchronous handling of requests.

### API Endpoints

1. **POST /send-connection-request**
   - **Description**: Sends a connection request to a specified LinkedIn profile.
   - **Request Body**:
     - `profileUrl`: The URL of the LinkedIn profile.
     - `messageTemplate`: An optional custom message to include with the connection request.
   - **Response**: JSON object indicating success or failure, and the result of the operation.

2. **POST /send-message**
   - **Description**: Sends a message to a specified LinkedIn profile.
   - **Request Body**:
     - `profileUrl`: The URL of the LinkedIn profile.
     - `message`: The message content to send.
   - **Response**: JSON object indicating success or failure, and the result of the operation.

3. **GET /check-connection-status**
   - **Description**: Checks the connection status of a specified LinkedIn profile.
   - **Query Parameters**:
     - `profileUrl`: The URL of the LinkedIn profile.
   - **Response**: JSON object indicating success or failure, and the connection status.

### Environment Variables

- `LINKEDIN_SESSION_COOKIE`: The session cookie for LinkedIn authentication.
- `USER_AGENT`: The user agent string to use for browser requests.
- `PORT`: The port on which the server runs (default is 3000).

### Error Handling

- Errors during operations are logged and returned in the API response.
- The server includes cleanup handlers to close the browser on shutdown or uncaught exceptions.

## Usage with n8n

The API is designed to be integrated with an n8n workflow, which can automate the process of sending connection requests and messages based on triggers or schedules. n8n can use the API endpoints to perform these actions as part of a larger automation strategy.

## Setup and Deployment

1. **Install Dependencies**: Run `npm install` to install the required packages.
2. **Configure Environment**: Set the necessary environment variables in a `.env` file.
3. **Start the Server**: Run `node index.js` to start the server.
4. **Integrate with n8n**: Use n8n's HTTP Request node to interact with the API endpoints.

## Conclusion

The LinkedIn Automation API provides a robust solution for automating LinkedIn outreach activities. By leveraging Puppeteer and Express, it offers a scalable and efficient way to manage LinkedIn interactions programmatically.
