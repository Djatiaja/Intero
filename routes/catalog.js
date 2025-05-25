const express = require('express');
const router = express.Router();

const apiCatalog = {
  version: '1.0.0',
  baseUrl: '/api',
  endpoints: [
    {
      path: '/auth/status',
      method: 'GET',
      description: 'Get current authentication status for Google and Trello',
      requiresAuth: false,
      parameters: [],
      responses: {
        '200': {
          description: 'Authentication status retrieved successfully',
          schema: {
            message: 'String',
            authStatus: { googleAuth: 'Boolean', trelloAuth: 'Boolean' },
          },
        },
      },
    },
    {
      path: '/auth/google',
      method: 'GET',
      description: 'Initiate Google OAuth authentication flow',
      requiresAuth: false,
      parameters: [
        {
          name: 'userId',
          in: 'query',
          required: false,
          description: 'Optional user ID to associate with the session',
        },
      ],
      responses: {
        '302': { description: 'Redirects to Google OAuth authorization URL' },
        '500': { description: 'Failed to generate Google authorization URL' },
      },
    },
    {
      path: '/auth/google/callback',
      method: 'GET',
      description: 'Handle Google OAuth callback and redirect to Trello authentication',
      requiresAuth: false,
      parameters: [
        {
          name: 'code',
          in: 'query',
          required: true,
          description: 'Authorization code from Google OAuth',
        },
      ],
      responses: {
        '302': { description: 'Redirects to Trello authentication' },
        '400': { description: 'Code not provided' },
        '500': { description: 'Failed to retrieve Google access token' },
      },
    },
    {
      path: '/auth/trello',
      method: 'GET',
      description: 'Initiate Trello authentication flow',
      requiresAuth: false,
      parameters: [],
      responses: {
        '302': { description: 'Redirects to Trello authorization URL' },
        '500': { description: 'Trello API Key not configured' },
      },
    },
    {
      path: '/auth/trello/redirect',
      method: 'GET',
      description: 'Handle Trello authorization redirect and render token processing page',
      requiresAuth: false,
      parameters: [],
      responses: {
        '200': { description: 'Renders HTML page to process Trello token' },
      },
    },
    {
      path: '/auth/trello/save-token',
      method: 'POST',
      description: 'Save Trello token and generate JWT token',
      requiresAuth: false,
      parameters: [
        {
          name: 'token',
          in: 'body',
          required: true,
          description: 'Trello authentication token',
        },
      ],
      responses: {
        '200': {
          description: 'Trello token saved successfully',
          schema: {
            success: 'Boolean',
            message: 'String',
            jwtToken: 'String',
          },
        },
        '400': {
          description: 'Token not provided or Google authentication required',
        },
      },
    },
    {
      path: '/auth-success',
      method: 'GET',
      description: 'Display authentication success page with JWT token',
      requiresAuth: false,
      parameters: [
        {
          name: 'token',
          in: 'query',
          required: true,
          description: 'JWT token to display',
        },
      ],
      responses: {
        '200': { description: 'Renders HTML success page with JWT token' },
      },
    },
    {
      path: '/logout',
      method: 'GET',
      description: 'Log out and destroy session',
      requiresAuth: false,
      parameters: [],
      responses: {
        '302': { description: 'Redirects to home page' },
        '500': { description: 'Failed to logout' },
      },
    },
    {
      path: '/trello/boards',
      method: 'GET',
      description: 'Get all Trello boards for the authenticated user',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [],
      responses: {
        '200': {
          description: 'List of Trello boards',
          schema: [{ id: 'String', name: 'String' }],
        },
        '401': { description: 'Not authenticated with Trello or token not found' },
        '500': { description: 'Failed to fetch Trello boards' },
      },
    },
    {
      path: '/trello/boards/:boardId/lists',
      method: 'GET',
      description: 'Get all lists within a Trello board',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'path',
          required: true,
          description: 'ID of the Trello board',
        },
      ],
      responses: {
        '200': {
          description: 'List of Trello lists in the board',
          schema: [{ id: 'String', name: 'String' }],
        },
        '401': { description: 'Not authenticated with Trello or token not found' },
        '500': { description: 'Failed to fetch Trello lists' },
      },
    },
    {
      path: '/trello/boards/:boardId/cards',
      method: 'GET',
      description: 'Get all cards from a Trello board',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'path',
          required: true,
          description: 'ID of the Trello board',
        },
      ],
      responses: {
        '200': { description: 'List of Trello cards in the board' },
        '401': { description: 'Not authenticated with Trello or token not found' },
        '500': { description: 'Failed to fetch Trello cards' },
      },
    },
    {
      path: '/sync/trello-to-calendar',
      method: 'POST',
      description: 'Sync Trello cards to Google Calendar events',
      requiresAuth: true,
      authNeeded: ['google', 'trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'body',
          required: true,
          description: 'ID of the Trello board to sync',
        },
        {
          name: 'dueOnly',
          in: 'body',
          required: false,
          default: true,
          description: 'Only sync cards with due dates',
        },
      ],
      responses: {
        '200': {
          description: 'Sync completed successfully',
          schema: {
            message: 'String',
            totalCards: 'Number',
            results: [
              {
                trelloCard: 'String',
                googleEventId: 'String (optional)',
                success: 'Boolean',
                error: 'String (optional)',
              },
            ],
          },
        },
        '400': { description: 'Board ID is required' },
        '401': {
          description: 'Not authenticated with Google or Trello, or tokens not found',
        },
        '500': { description: 'Failed to sync Trello cards to Google Calendar' },
      },
    },
    {
      path: '/calendar/events',
      method: 'GET',
      description: 'Get upcoming Google Calendar events',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [],
      responses: {
        '200': { description: 'List of Google Calendar events' },
        '401': { description: 'Not authenticated with Google or tokens not found' },
        '500': { description: 'Failed to fetch Google Calendar events' },
      },
    },
    {
      path: '/calendar/events/:eventId',
      method: 'GET',
      description: 'Get a specific Google Calendar event by ID',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [
        {
          name: 'eventId',
          in: 'path',
          required: true,
          description: 'ID of the Google Calendar event',
        },
        {
          name: 'calendarId',
          in: 'query',
          required: false,
          description: 'ID of the calendar (default: "primary")',
        },
      ],
      responses: {
        '200': { description: 'Event retrieved successfully', schema: { id: 'String', summary: 'String', start: 'Object', end: 'Object' } },
        '401': { description: 'Not authenticated with Google or tokens not found' },
        '404': { description: 'Event not found' },
        '500': { description: 'Failed to fetch Calendar event' },
      },
    },
    {
      path: '/calendar/events',
      method: 'POST',
      description: 'Create a new Google Calendar event',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [
        {
          name: 'calendarId',
          in: 'query',
          required: false,
          description: 'ID of the calendar (default: "primary")',
        },
        {
          name: 'summary',
          in: 'body',
          required: true,
          description: 'Summary of the event',
        },
        {
          name: 'start',
          in: 'body',
          required: true,
          description: 'Start time of the event',
        },
        {
          name: 'end',
          in: 'body',
          required: true,
          description: 'End time of the event',
        },
      ],
      responses: {
        '200': { description: 'Event created successfully', schema: { id: 'String', summary: 'String', start: 'Object', end: 'Object' } },
        '400': { description: 'Required fields (summary, start, end) are missing' },
        '401': { description: 'Not authenticated with Google or tokens not found' },
        '500': { description: 'Failed to create Calendar event' },
      },
    },
    {
      path: '/calendar/events/:eventId',
      method: 'PUT',
      description: 'Update an existing Google Calendar event',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [
        {
          name: 'eventId',
          in: 'path',
          required: true,
          description: 'ID of the Google Calendar event',
        },
        {
          name: 'calendarId',
          in: 'query',
          required: false,
          description: 'ID of the calendar (default: "primary")',
        },
        {
          name: 'summary',
          in: 'body',
          required: true,
          description: 'Summary of the event',
        },
        {
          name: 'start',
          in: 'body',
          required: true,
          description: 'Start time of the event',
        },
        {
          name: 'end',
          in: 'body',
          required: true,
          description: 'End time of the event',
        },
      ],
      responses: {
        '200': { description: 'Event updated successfully', schema: { id: 'String', summary: 'String', start: 'Object', end: 'Object' } },
        '400': { description: 'Required fields (summary, start, end) are missing' },
        '401': { description: 'Not authenticated with Google or tokens not found' },
        '500': { description: 'Failed to update Calendar event' },
      },
    },
    {
      path: '/calendar/events/:eventId',
      method: 'DELETE',
      description: 'Delete a Google Calendar event',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [
        {
          name: 'eventId',
          in: 'path',
          required: true,
          description: 'ID of the Google Calendar event',
        },
        {
          name: 'calendarId',
          in: 'query',
          required: false,
          description: 'ID of the calendar (default: "primary")',
        },
      ],
      responses: {
        '200': { description: 'Event deleted successfully' },
        '401': { description: 'Not authenticated with Google or tokens not found' },
        '500': { description: 'Failed to delete Calendar event' },
      },
    },
    {
      path: '/reauthenticate',
      method: 'GET',
      description: 'Check which services need reauthentication',
      requiresAuth: true,
      parameters: [],
      responses: {
        '200': {
          description: 'Authentication status and next steps',
          schema: {
            message: 'String',
            authUrl: 'String (optional)',
            status: {
              googleAuth: 'Boolean (optional)',
              trelloAuth: 'Boolean (optional)',
            },
          },
        },
        '401': { description: 'Invalid or missing JWT token' },
      },
    },
    {
      path: '/catalog',
      method: 'GET',
      description: 'Get the API catalog with all available endpoints',
      requiresAuth: false,
      parameters: [],
      responses: {
        '200': {
          description: 'API catalog retrieved successfully',
          schema: {
            version: 'String',
            baseUrl: 'String',
            endpoints: 'Array',
          },
        },
      },
    },
    {
      path: '/docs',
      method: 'GET',
      description: 'Render API documentation UI',
      requiresAuth: false,
      parameters: [],
      responses: {
        '200': { description: 'Renders HTML API documentation page' },
      },
    },
  ],
};

// API Catalog Endpoint
router.get('/catalog', (req, res) => {
  res.json(apiCatalog);
});

// API Documentation UI
router.get('/docs', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Documentation - Trello-Google Calendar Integration</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50">
  <!-- Navigation -->
  <nav class="bg-white shadow-sm border-b">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex justify-center items-center h-16">
        <div class="flex space-x-8">
          <a href="/" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Home
          </a>
          <a href="/api/docs" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            API Documentation
          </a>
          <a href="/auth/google" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Google Auth
          </a>
          <a href="/auth/trello" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Trello Auth
          </a>
        </div>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <div class="max-w-6xl mx-auto px-4 py-12">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">
        API Documentation
      </h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
        Complete reference for the Trello-Google Calendar Integration API
      </p>
      <div class="flex justify-center space-x-4 text-sm">
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Version: ${apiCatalog.version}
        </span>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Base URL: ${baseUrl}${apiCatalog.baseUrl}
        </span>
      </div>
    </div>

    <!-- Authentication Flow -->
    <div class="bg-white rounded-lg shadow-sm border p-8 mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6">Authentication Flow</h2>
      <p class="text-gray-600 mb-6">
        Our API uses a two-step authentication process:
      </p>
      
      <div class="space-y-4 mb-6">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              1
            </div>
          </div>
          <div class="ml-4">
            <p class="text-gray-900 font-medium">Authenticate with Google and receive a partial token</p>
          </div>
        </div>
        
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              2
            </div>
          </div>
          <div class="ml-4">
            <p class="text-gray-900 font-medium">Authenticate with Trello and receive another partial token</p>
          </div>
        </div>
        
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              3
            </div>
          </div>
          <div class="ml-4">
            <p class="text-gray-900 font-medium">Combine both tokens to create a single JWT that grants access to all API endpoints</p>
          </div>
        </div>
      </div>
      
      <div class="p-4 bg-blue-50 rounded-lg">
        <p class="text-sm text-blue-800">
          <strong>Note:</strong> You can start the authentication process from either Google or Trello.
        </p>
      </div>
    </div>

    <!-- Endpoints -->
    <div class="space-y-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6">API Endpoints</h2>
      
      ${apiCatalog.endpoints
        .map(
          (endpoint) => `
      <div class="bg-white rounded-lg shadow-sm border overflow-hidden">
        <!-- Endpoint Header -->
        <div class="px-6 py-4 bg-gray-50 border-b">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                endpoint.method === 'GET' ? 'bg-green-100 text-green-800' :
                endpoint.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                endpoint.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }">
                ${endpoint.method}
              </span>
              <code class="text-sm font-mono text-gray-900">${apiCatalog.baseUrl}${endpoint.path}</code>
            </div>
            ${endpoint.requiresAuth ? `
            <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
              🔒 Auth Required${endpoint.authNeeded ? `: ${endpoint.authNeeded.join(', ')}` : ''}
            </span>
            ` : ''}
          </div>
        </div>
        
        <!-- Endpoint Body -->
        <div class="px-6 py-4">
          <p class="text-gray-700 mb-4">${endpoint.description}</p>
          
          ${endpoint.parameters.length > 0 ? `
          <div class="mb-6">
            <h4 class="text-lg font-medium text-gray-900 mb-3">Parameters</h4>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Default</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${endpoint.parameters
                    .map(
                      (param) => `
                  <tr>
                    <td class="px-4 py-2 text-sm font-mono text-gray-900">${param.name}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${param.in}</td>
                    <td class="px-4 py-2 text-sm">
                      ${param.required ? 
                        '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Required</span>' :
                        '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">Optional</span>'
                      }
                    </td>
                    <td class="px-4 py-2 text-sm text-gray-700">${param.description}</td>
                    <td class="px-4 py-2 text-sm text-gray-500">${param.default !== undefined ? param.default : '-'}</td>
                  </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : `
          <div class="mb-6">
            <h4 class="text-lg font-medium text-gray-900 mb-3">Parameters</h4>
            <p class="text-gray-500 italic">No parameters required</p>
          </div>
          `}
          
          <div>
            <h4 class="text-lg font-medium text-gray-900 mb-3">Responses</h4>
            <div class="space-y-4">
              ${Object.entries(endpoint.responses)
                .map(
                  ([code, response]) => `
              <div class="border rounded-lg p-4">
                <div class="flex items-center space-x-2 mb-2">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                    code.startsWith('2') ? 'bg-green-100 text-green-800' :
                    code.startsWith('3') ? 'bg-blue-100 text-blue-800' :
                    code.startsWith('4') ? 'bg-yellow-100 text-yellow-800' :
                    code.startsWith('5') ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }">
                    ${code}
                  </span>
                  <span class="text-sm text-gray-700">${response.description}</span>
                </div>
                ${response.schema ? `
                <div class="mt-2">
                  <h5 class="text-sm font-medium text-gray-900 mb-1">Response Schema:</h5>
                  <pre class="bg-gray-50 p-3 rounded text-xs overflow-x-auto"><code>${JSON.stringify(response.schema, null, 2)}</code></pre>
                </div>
                ` : ''}
              </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
      `
        )
        .join('')}
    </div>
  </div>
</body>
</html>
  `);
});

// Auth Status Endpoint
router.get('/auth/status', (req, res) => {
  const authStatus = {
    googleAuth: !!req.session.googleTokens,
    trelloAuth: !!req.session.trelloToken,
  };
  res.json({
    message: 'Authentication status retrieved successfully',
    authStatus,
  });
});

module.exports = router;