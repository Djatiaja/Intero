const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const oauth2Client = require('../config/google');
const axios = require('axios');
const { google } = require('googleapis');
const { TRELLO_API_KEY } = require('../config/trello');

const apiCatalog = {
  "version": "1.0.0",
  "baseUrl": "/api",
  "endpoints": [
    {
      "path": "/register",
      "method": "POST",
      "description": "Register a new user with email and password",
      "requiresAuth": false,
      "parameters": [
        {
          "name": "email",
          "in": "body",
          "required": true,
          "description": "User's email address"
        },
        {
          "name": "password",
          "in": "body",
          "required": true,
          "description": "User's password"
        }
      ],
      "responses": {
        "201": {
          "description": "User registered successfully",
          "schema": {
            "message": "String"
          }
        },
        "400": {
          "description": "Registration failed",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/login",
      "method": "POST",
      "description": "Log in a user and return a JWT token",
      "requiresAuth": false,
      "parameters": [
        {
          "name": "email",
          "in": "body",
          "required": true,
          "description": "User's email address"
        },
        {
          "name": "password",
          "in": "body",
          "required": true,
          "description": "User's password"
        }
      ],
      "responses": {
        "200": {
          "description": "Login successful, JWT token returned",
          "schema": {
            "token": "String"
          }
        },
        "401": {
          "description": "Invalid credentials",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Login failed",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/auth/google",
      "method": "GET",
      "description": "Initiate Google OAuth authentication flow",
      "requiresAuth": false,
      "parameters": [],
      "responses": {
        "200": {
          "description": "Returns Google OAuth authorization URL",
          "schema": {
            "authUrl": "String"
          }
        },
        "500": {
          "description": "Failed to generate Google authorization URL",
          "schema": {
            "error": "String"
          }
        }
      }
    },
    {
      "path": "/auth/google/callback",
      "method": "GET",
      "description": "Handle Google OAuth callback and store tokens",
      "requiresAuth": true,
      "parameters": [
        {
          "name": "code",
          "in": "query",
          "required": true,
          "description": "Authorization code from Google OAuth"
        }
      ],
      "responses": {
        "302": {
          "description": "Redirects to authentication success page"
        },
        "500": {
          "description": "Failed to retrieve Google access token",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/auth/trello",
      "method": "POST",
      "description": "Save Trello authentication token",
      "requiresAuth": true,
      "parameters": [
        {
          "name": "trelloToken",
          "in": "body",
          "required": true,
          "description": "Trello authentication token"
        }
      ],
      "responses": {
        "200": {
          "description": "Trello authentication successful",
          "schema": {
            "message": "String"
          }
        },
        "500": {
          "description": "Trello authentication failed",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/auth/success",
      "method": "GET",
      "description": "Display authentication success page",
      "requiresAuth": false,
      "parameters": [],
      "responses": {
        "200": {
          "description": "Authentication success page rendered",
          "schema": {
            "message": "String"
          }
        }
      }
    },
    {
      "path": "/sync/boards",
      "method": "POST",
      "description": "Enable or disable synchronization for specified Trello boards",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "boards",
          "in": "body",
          "required": true,
          "description": "Array of objects containing boardId and listId"
        },
        {
          "name": "enable",
          "in": "body",
          "required": true,
          "description": "Boolean to enable or disable synchronization"
        }
      ],
      "responses": {
        "200": {
          "description": "Synchronization settings updated successfully",
          "schema": {
            "message": "String",
            "boards": "Array"
          }
        },
        "400": {
          "description": "Invalid boards array or enable boolean",
          "schema": {
            "error": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Trello or invalid JWT",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to update synchronization settings",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/sync",
      "method": "POST",
      "description": "Manually trigger synchronization between Trello and Google Calendar",
      "requiresAuth": true,
      "authNeeded": ["google", "trello"],
      "parameters": [
        {
          "name": "boardId",
          "in": "body",
          "required": true,
          "description": "ID of the Trello board to sync"
        },
        {
          "name": "listId",
          "in": "body",
          "required": true,
          "description": "ID of the Trello list to sync"
        }
      ],
      "responses": {
        "200": {
          "description": "Synchronization completed successfully",
          "schema": {
            "message": "String",
            "trelloToCalendar": "Array",
            "calendarToTrello": "Array"
          }
        },
        "400": {
          "description": "Board ID or list ID missing",
          "schema": {
            "error": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Google or Trello",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Synchronization failed",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/sync/logs",
      "method": "GET",
      "description": "Retrieve synchronization logs for the authenticated user",
      "requiresAuth": true,
      "parameters": [],
      "responses": {
        "200": {
          "description": "Synchronization logs retrieved successfully",
          "schema": [
            {
              "userId": "String",
              "type": "String",
              "action": "String",
              "details": "Object",
              "timestamp": "Date"
            }
          ]
        },
        "500": {
          "description": "Failed to retrieve synchronization logs",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards",
      "method": "GET",
      "description": "Get all Trello boards for the authenticated user",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [],
      "responses": {
        "200": {
          "description": "List of Trello boards",
          "schema": [
            {
              "id": "String",
              "name": "String"
            }
          ]
        },
        "401": {
          "description": "Not authenticated with Trello or token not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Trello boards",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards/:boardId",
      "method": "GET",
      "description": "Get details of a specific Trello board",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "boardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello board"
        }
      ],
      "responses": {
        "200": {
          "description": "Trello board details",
          "schema": {
            "id": "String",
            "name": "String",
            "desc": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Trello or token not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Trello board",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards",
      "method": "POST",
      "description": "Create a new Trello board",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "name",
          "in": "body",
          "required": true,
          "description": "Name of the new board"
        },
        {
          "name": "desc",
          "in": "body",
          "required": false,
          "description": "Description of the new board"
        },
        {
          "name": "defaultLists",
          "in": "body",
          "required": false,
          "description": "Whether to create default lists",
          "default": true
        }
      ],
      "responses": {
        "201": {
          "description": "Trello board created successfully",
          "schema": {
            "id": "String",
            "name": "String",
            "desc": "String"
          }
        },
        "400": {
          "description": "Board name is required",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to create Trello board",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards/:boardId/archive",
      "method": "PUT",
      "description": "Archive a Trello board",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "boardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello board to archive"
        }
      ],
      "responses": {
        "200": {
          "description": "Board archived successfully",
          "schema": {
            "message": "String",
            "data": "Object"
          }
        },
        "400": {
          "description": "Board ID is required",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to archive Trello board",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards/:boardId/lists",
      "method": "GET",
      "description": "Get all lists within a Trello board",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "boardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello board"
        }
      ],
      "responses": {
        "200": {
          "description": "List of Trello lists in the board",
          "schema": [
            {
              "id": "String",
              "name": "String"
            }
          ]
        },
        "401": {
          "description": "Not authenticated with Trello or token not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Trello lists",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/boards/:boardId/cards",
      "method": "GET",
      "description": "Get all cards from a Trello board",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "boardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello board"
        }
      ],
      "responses": {
        "200": {
          "description": "List of Trello cards in the board",
          "schema": [
            {
              "id": "String",
              "name": "String",
              "due": "String",
              "idList": "String",
              "idBoard": "String"
            }
          ]
        },
        "401": {
          "description": "Not authenticated with Trello or token not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Trello cards",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/cards/:cardId",
      "method": "GET",
      "description": "Get details of a specific Trello card",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "cardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello card"
        }
      ],
      "responses": {
        "200": {
          "description": "Trello card details",
          "schema": {
            "id": "String",
            "name": "String",
            "desc": "String",
            "idList": "String",
            "idBoard": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Trello or token not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetches Trello card",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/cards",
      "method": "POST",
      "description": "Create a new Trello card",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "name",
          "in": "body",
          "required": true,
          "description": "Name of the new card"
        },
        {
          "name": "desc",
          "in": "body",
          "required": false,
          "description": "Description of the new card"
        },
        {
          "name": "idList",
          "in": "body",
          "required": true,
          "description": "ID of the list to add the card to"
        }
      ],
      "responses": {
        "201": {
          "description": "Trello card created successfully",
          "schema": {
            "id": "String",
            "name": "String",
            "desc": "String",
            "idList": "String"
          }
        },
        "400": {
          "description": "Name or idList is required",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to create Trello card",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/cards/:cardId",
      "method": "PUT",
      "description": "Update an existing Trello card",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "cardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello card to update"
        },
        {
          "name": "name",
          "in": "body",
          "required": false,
          "description": "Updated name of the card"
        },
        {
          "name": "desc",
          "in": "body",
          "required": false,
          "description": "Updated description of the card"
        },
        {
          "name": "idList",
          "in": "body",
          "required": false,
          "description": "Updated list ID for the card"
        }
      ],
      "responses": {
        "200": {
          "description": "Trello card updated successfully",
          "schema": {
            "id": "String",
            "name": "String",
            "desc": "String",
            "idList": "String"
          }
        },
        "500": {
          "description": "Failed to update Trello card",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/trello/cards/:cardId",
      "method": "DELETE",
      "description": "Delete a Trello card",
      "requiresAuth": true,
      "authNeeded": ["trello"],
      "parameters": [
        {
          "name": "cardId",
          "in": "path",
          "required": true,
          "description": "ID of the Trello card to delete"
        }
      ],
      "responses": {
        "200": {
          "description": "Trello card deleted successfully",
          "schema": {
            "success": "Boolean",
            "message": "String"
          }
        },
        "500": {
          "description": "Failed to delete Trello card",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/calendar/events",
      "method": "GET",
      "description": "Get upcoming Google Calendar events",
      "requiresAuth": true,
      "authNeeded": ["google"],
      "parameters": [],
      "responses": {
        "200": {
          "description": "List of Google Calendar events",
          "schema": [
            {
              "id": "String",
              "title": "String",
              "start": "String",
              "trelloCardId": "String",
              "boardId": "String"
            }
          ]
        },
        "401": {
          "description": "Not authenticated with Google or tokens not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Google Calendar events",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/calendar/events/:eventId",
      "method": "GET",
      "description": "Get a specific Google Calendar event by ID",
      "requiresAuth": true,
      "authNeeded": ["google"],
      "parameters": [
        {
          "name": "eventId",
          "in": "path",
          "required": true,
          "description": "ID of the Google Calendar event"
        }
      ],
      "responses": {
        "200": {
          "description": "Event retrieved successfully",
          "schema": {
            "id": "String",
            "summary": "String",
            "start": "Object",
            "end": "Object"
          }
        },
        "401": {
          "description": "Not authenticated with Google or tokens not found",
          "schema": {
            "error": "String"
          }
        },
        "404": {
          "description": "Event not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to fetch Calendar event",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/calendar/events",
      "method": "POST",
      "description": "Create a new Google Calendar event",
      "requiresAuth": true,
      "authNeeded": ["google"],
      "parameters": [
        {
          "name": "summary",
          "in": "body",
          "required": true,
          "description": "Summary of the event"
        },
        {
          "name": "start",
          "in": "body",
          "required": true,
          "description": "Start time of the event"
        },
        {
          "name": "end",
          "in": "body",
          "required": true,
          "description": "End time of the event"
        }
      ],
      "responses": {
        "200": {
          "description": "Event created successfully",
          "schema": {
            "id": "String",
            "summary": "String",
            "start": "Object",
            "end": "Object"
          }
        },
        "400": {
          "description": "Required fields (summary, start, end) are missing",
          "schema": {
            "error": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Google or tokens not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to create Calendar event",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/calendar/events/:eventId",
      "method": "PUT",
      "description": "Update an existing Google Calendar event",
      "requiresAuth": true,
      "authNeeded": ["google"],
      "parameters": [
        {
          "name": "eventId",
          "in": "path",
          "required": true,
          "description": "ID of the Google Calendar event"
        },
        {
          "name": "summary",
          "in": "body",
          "required": true,
          "description": "Summary of the event"
        },
        {
          "name": "start",
          "in": "body",
          "required": true,
          "description": "Start time of the event"
        },
        {
          "name": "end",
          "in": "body",
          "required": true,
          "description": "End time of the event"
        }
      ],
      "responses": {
        "200": {
          "description": "Event updated successfully",
          "schema": {
            "id": "String",
            "summary": "String",
            "start": "Object",
            "end": "Object"
          }
        },
        "400": {
          "description": "Required fields (summary, start, end) are missing",
          "schema": {
            "error": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Google or tokens not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to update Calendar event",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/calendar/events/:eventId",
      "method": "DELETE",
      "description": "Delete a Google Calendar event",
      "requiresAuth": true,
      "authNeeded": ["google"],
      "parameters": [
        {
          "name": "eventId",
          "in": "path",
          "required": true,
          "description": "ID of the Google Calendar event"
        }
      ],
      "responses": {
        "200": {
          "description": "Event deleted successfully",
          "schema": {
            "message": "String"
          }
        },
        "401": {
          "description": "Not authenticated with Google or tokens not found",
          "schema": {
            "error": "String"
          }
        },
        "500": {
          "description": "Failed to delete Calendar event",
          "schema": {
            "error": "String",
            "details": "String"
          }
        }
      }
    },
    {
      "path": "/reauthenticate",
      "method": "GET",
      "description": "Check which services need reauthentication",
      "requiresAuth": true,
      "parameters": [],
      "responses": {
        "200": {
          "description": "Authentication status and next steps",
          "schema": {
            "message": "String",
            "authUrl": "String",
            "status": {
              "googleAuth": "Boolean",
              "trelloAuth": "Boolean"
            }
          }
        },
        "401": {
          "description": "Invalid or missing JWT token",
          "schema": {
            "error": "String"
          }
        }
      }
    },
    {
      "path": "/catalog",
      "method": "GET",
      "description": "Get the API catalog with all available endpoints",
      "requiresAuth": false,
      "parameters": [],
      "responses": {
        "200": {
          "description": "API catalog retrieved successfully",
          "schema": {
            "version": "String",
            "baseUrl": "String",
            "endpoints": "Array"
          }
        }
      }
    },
    {
      "path": "/docs",
      "method": "GET",
      "description": "Render API documentation UI",
      "requiresAuth": false,
      "parameters": [],
      "responses": {
        "200": {
          "description": "Renders HTML API documentation page"
        }
      }
    },
    {
      "path": "/debug/routes",
      "method": "GET",
      "description": "List all registered routes for debugging purposes",
      "requiresAuth": false,
      "parameters": [],
      "responses": {
        "200": {
          "description": "List of all registered routes",
          "schema": {
            "message": "String",
            "routes": [
              {
                "path": "String",
                "methods": "Array"
              }
            ]
          }
        }
      }
    }
  ]
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token tidak valid', details: error.message });
  }
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
  <nav class="bg-white shadow-sm border-b">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex justify-center items-center h-16">
        <div class="flex space-x-8">
          <a href="/" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">Home</a>
          <a href="/api/docs" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">API Documentation</a>
          <a href="/api/auth/google" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">Google Auth</a>
          <a href="/api/auth/trello" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">Trello Auth</a>
        </div>
      </div>
    </div>
  </nav>

  <div class="max-w-6xl mx-auto px-4 py-12">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">API Documentation</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto mb-6">Complete reference for the Trello-Google Calendar Integration API</p>
      <div class="flex justify-center space-x-4 text-sm">
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Version: ${apiCatalog.version}</span>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Base URL: ${baseUrl}${apiCatalog.baseUrl}</span>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border p-8 mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6">Authentication Flow</h2>
      <p class="text-gray-600 mb-6">Our API uses a two-step authentication process:</p>
      
      <div class="space-y-4 mb-6">
        <div class="flex items-start">
          <div class="flex-shrink-0"><div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">1</div></div>
          <div class="ml-4"><p class="text-gray-900 font-medium">Authenticate with Google and receive a partial token</p></div>
        </div>
        <div class="flex items-start">
          <div class="flex-shrink-0"><div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">2</div></div>
          <div class="ml-4"><p class="text-gray-900 font-medium">Authenticate with Trello and receive another partial token</p></div>
        </div>
        <div class="flex items-start">
          <div class="flex-shrink-0"><div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">3</div></div>
          <div class="ml-4"><p class="text-gray-900 font-medium">Combine both tokens to create a single JWT that grants access to all API endpoints</p></div>
        </div>
      </div>
      <div class="p-4 bg-blue-50 rounded-lg"><p class="text-sm text-blue-800"><strong>Note:</strong> You can start the authentication process from either Google or Trello.</p></div>
    </div>

    <div class="space-y-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6">API Endpoints</h2>
      ${apiCatalog.endpoints
        .map(
          (endpoint) => `
      <div class="bg-white rounded-lg shadow-sm border overflow-hidden">
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
  if (!req.user) return res.status(401).json({ error: 'User not authenticated' });
  res.json({
    message: 'Authentication status retrieved successfully',
    authStatus: {
      googleAuth: !!req.user.googleAuth,
      trelloAuth: !!req.user.trelloAuth,
    },
  });
});

// Google OAuth Initiation
router.get('/auth/google', (req, res) => {
  const userId = req.query.userId;
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: userId,
  });
  res.redirect(authUrl);
});

// Google OAuth Callback
router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code not provided' });
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const user = await User.findOne({ googleAuth: true }) || new User({ googleAuth: true, googleTokens: tokens });
    await user.save();
    req.session.googleTokens = tokens;
    res.redirect('/api/auth/trello');
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve Google access token', details: error.message });
  }
});

// Trello Authentication Initiation
router.get('/auth/trello', (req, res) => {
  if (!TRELLO_API_KEY) return res.status(500).json({ error: 'Trello API Key not configured' });
  const trelloAuthUrl = `https://trello.com/1/authorize?key=${TRELLO_API_KEY}&scope=read,write&expiration=never&name=InteroApp&response_type=token&callback_method=fragment&return_url=${encodeURIComponent(`${req.protocol}://${req.get('host')}/api/auth/trello/redirect`)}`;
  res.redirect(trelloAuthUrl);
});

// Trello Redirect Handler
router.get('/auth/trello/redirect', (req, res) => {
  const token = req.query.token || (req.url.split('#access_token=')[1] || '').split('&')[0];
  if (token) {
    res.send(`
      <html>
        <body>
          <script>
            window.location.href = '/api/auth/trello/save-token?token=${token}';
          </script>
        </body>
      </html>
    `);
  } else {
    res.status(400).send('No token found');
  }
});

// Save Trello Token
router.post('/auth/trello/save-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token not provided' });
  if (!req.session.googleTokens) return res.status(400).json({ error: 'Google authentication required' });
  try {
    const user = await User.findOne({ googleAuth: true }) || new User({ googleAuth: true, googleTokens: req.session.googleTokens });
    user.trelloAuth = true;
    user.trelloToken = token;
    await user.save();
    const jwtToken = jwt.sign({ id: user._id, email: user.email || 'anonymous' }, process.env.JWT_SECRET || 'your_jwt_secret_key', { expiresIn: '1h' });
    res.json({ success: true, message: 'Trello token saved successfully', jwtToken });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save Trello token', details: error.message });
  }
});

// Authentication Success Page
router.get('/auth-success', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Token not provided' });
  res.send(`
    <html>
      <body>
        <h1>Authentication Successful</h1>
        <p>Your JWT Token: ${token}</p>
        <a href="/">Return to Home</a>
      </body>
    </html>
  `);
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.redirect('/');
  });
});

// Trello Boards
router.get('/trello/boards', verifyToken, async (req, res) => {
  if (!req.user.trelloAuth) return res.status(401).json({ error: 'Not authenticated with Trello or token not found' });
  try {
    const response = await axios.get('https://api.trello.com/1/members/me/boards', {
      params: { key: TRELLO_API_KEY, token: req.user.trelloToken },
    });
    res.json(response.data.map(board => ({ id: board.id, name: board.name })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Trello boards', details: error.message });
  }
});

// Trello Board Lists
router.get('/trello/boards/:boardId/lists', verifyToken, async (req, res) => {
  if (!req.user.trelloAuth) return res.status(401).json({ error: 'Not authenticated with Trello or token not found' });
  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${req.params.boardId}/lists`, {
      params: { key: TRELLO_API_KEY, token: req.user.trelloToken },
    });
    res.json(response.data.map(list => ({ id: list.id, name: list.name })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Trello lists', details: error.message });
  }
});

// Trello Board Cards
router.get('/trello/boards/:boardId/cards', verifyToken, async (req, res) => {
  if (!req.user.trelloAuth) return res.status(401).json({ error: 'Not authenticated with Trello or token not found' });
  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${req.params.boardId}/cards`, {
      params: { key: TRELLO_API_KEY, token: req.user.trelloToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Trello cards', details: error.message });
  }
});

// Sync Trello to Calendar
router.post('/sync/trello-to-calendar', verifyToken, async (req, res) => {
  if (!req.user.googleAuth || !req.user.trelloAuth) return res.status(401).json({ error: 'Not authenticated with Google or Trello, or tokens not found' });
  const { boardId, dueOnly = true } = req.body;
  if (!boardId) return res.status(400).json({ error: 'Board ID is required' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const trelloResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: { key: TRELLO_API_KEY, token: req.user.trelloToken },
    });
    const cards = trelloResponse.data.filter(card => !dueOnly || card.due);
    const results = [];
    for (const card of cards) {
      try {
        const event = {
          summary: card.name,
          start: { dateTime: card.due || new Date().toISOString(), timeZone: 'UTC' },
          end: { dateTime: card.due ? new Date(new Date(card.due).getTime() + 3600000).toISOString() : new Date().toISOString(), timeZone: 'UTC' },
        };
        const eventResponse = await calendar.events.insert({ calendarId: 'primary', resource: event });
        results.push({ trelloCard: card.id, googleEventId: eventResponse.data.id, success: true });
      } catch (error) {
        results.push({ trelloCard: card.id, success: false, error: error.message });
      }
    }
    res.json({ message: 'Sync completed successfully', totalCards: cards.length, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync Trello cards to Google Calendar', details: error.message });
  }
});

// Google Calendar Events
router.get('/calendar/events', verifyToken, async (req, res) => {
  if (!req.user.googleAuth) return res.status(401).json({ error: 'Not authenticated with Google or tokens not found' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({ calendarId: 'primary', timeMin: new Date().toISOString(), maxResults: 10 });
    res.json(response.data.items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Google Calendar events', details: error.message });
  }
});

// Get Specific Calendar Event
router.get('/calendar/events/:eventId', verifyToken, async (req, res) => {
  if (!req.user.googleAuth) return res.status(401).json({ error: 'Not authenticated with Google or tokens not found' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.get({ calendarId: 'primary', eventId: req.params.eventId });
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      res.status(404).json({ error: 'Event not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch Calendar event', details: error.message });
    }
  }
});

// Create Calendar Event
router.post('/calendar/events', verifyToken, async (req, res) => {
  if (!req.user.googleAuth) return res.status(401).json({ error: 'Not authenticated with Google or tokens not found' });
  const { summary, start, end } = req.body;
  if (!summary || !start || !end) return res.status(400).json({ error: 'Required fields (summary, start, end) are missing' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.insert({ calendarId: 'primary', resource: { summary, start, end } });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create Calendar event', details: error.message });
  }
});

// Update Calendar Event
router.put('/calendar/events/:eventId', verifyToken, async (req, res) => {
  if (!req.user.googleAuth) return res.status(401).json({ error: 'Not authenticated with Google or tokens not found' });
  const { summary, start, end } = req.body;
  if (!summary || !start || !end) return res.status(400).json({ error: 'Required fields (summary, start, end) are missing' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.update({ calendarId: 'primary', eventId: req.params.eventId, resource: { summary, start, end } });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update Calendar event', details: error.message });
  }
});

// Delete Calendar Event
router.delete('/calendar/events/:eventId', verifyToken, async (req, res) => {
  if (!req.user.googleAuth) return res.status(401).json({ error: 'Not authenticated with Google or tokens not found' });
  try {
    oauth2Client.setCredentials(req.user.googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId: req.params.eventId });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete Calendar event', details: error.message });
  }
});

// Reauthenticate Check
router.get('/reauthenticate', verifyToken, (req, res) => {
  const needsGoogleAuth = !req.user.googleAuth;
  const needsTrelloAuth = !req.user.trelloAuth;
  if (needsGoogleAuth || needsTrelloAuth) {
    const authUrl = needsGoogleAuth ? '/api/auth/google' : needsTrelloAuth ? '/api/auth/trello' : null;
    res.json({
      message: 'Reauthentication required',
      authUrl,
      status: { googleAuth: !needsGoogleAuth, trelloAuth: !needsTrelloAuth },
    });
  } else {
    res.json({ message: 'All services authenticated', status: { googleAuth: true, trelloAuth: true } });
  }
});

module.exports = router;