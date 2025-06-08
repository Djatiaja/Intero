# Trello-Google Calendar Integration API

A Node.js-based application designed to seamlessly connect Trello boards with Google Calendar, enabling users to synchronize Trello cards with Google Calendar events. This API bridges project management in Trello with scheduling in Google Calendar, facilitating efficient task management through secure authentication and data synchronization.

## Purpose

The primary goal of this project is to enhance productivity by integrating two powerful tools:
- **Trello**: A visual project management tool for organizing tasks and workflows.
- **Google Calendar**: A scheduling tool for managing events and deadlines.

By syncing Trello cards (tasks) with Google Calendar events, users can visualize tasks on a calendar, ensuring better time management and deadline tracking. This API is ideal for developers, teams, or individuals looking to automate workflows and streamline task scheduling.

## Features

- **Authentication**: Secure OAuth2 authentication for Trello and Google services.
- **Trello Management**: Create, retrieve, update, and archive Trello boards, lists, and cards.
- **Google Calendar Integration**: Create, retrieve, update, and delete Google Calendar events.
- **Synchronization**: Sync Trello cards (with or without due dates) to Google Calendar as events.
- **API Documentation**: Comprehensive API catalog with a user-friendly documentation interface.

## Prerequisites

Before setting up and using the API, ensure you have the following:
- **Node.js** (version 16 or higher)
- **Trello API Key**: Obtain from the [Trello Developer Portal](https://trello.com/app-key).
- **Google API Credentials**: Create a project in the [Google Cloud Console](https://console.cloud.google.com/) and enable the Google Calendar API.
- **Environment Variables**: Configure a `.env` file with the following:

```env
SESSION_SECRET=your-session-secret
TRELLO_API_KEY=your-trello-api-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
JWT_SECRET=your-jwt-secret
```

## Installation

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd trello-google-calendar-integration
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   Create a `.env` file in the project root and add the required environment variables (as shown above).

4. **Run the Application**:
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:3000`.

## Usage

### Step 1: Authentication

To use the API, authenticate with both Trello and Google services to obtain a JWT token.

1. **Initiate Google Authentication**:
   - Visit `http://localhost:3000/auth/google`.
   - You’ll be redirected to Google’s OAuth consent screen. Grant the required permissions.
   - Upon successful authentication, you’ll be redirected to Trello authentication.

2. **Initiate Trello Authentication**:
   - On the Trello authorization page, grant access to your Trello account.
   - After completion, you’ll be redirected to `/auth-success`, where a JWT token will be displayed.

3. **Save the JWT Token**:
   - Copy the JWT token from the `/auth-success` page. This token is required for authenticated API requests.
   - Include the token in the `Authorization` header for requests:
     ```
     Authorization: Bearer <your-jwt-token>
     ```

### Step 2: Using the API

Use tools like Postman, cURL, or any HTTP client to interact with the API. The base URL is:
```
http://localhost:3000/api
```

- **View API Documentation**:
  Access interactive API documentation at `http://localhost:3000/api/docs` for a complete list of endpoints and usage instructions.

- **Check Authentication Status**:
  ```bash
  curl http://localhost:3000/api/auth/status
  ```
  This returns the current authentication status for Google and Trello.

## Key Endpoints

### 1. Authentication Flow

- **GET /auth/google**
  - **Description**: Initiates Google OAuth authentication.
  - **Parameters**:
    - `userId` (query, optional): Associates a user ID with the session.
  - **Responses**:
    - `302`: Redirects to Google’s OAuth authorization URL.
    - `500`: Failed to generate Google authorization URL.
  - **Example**:
    ```bash
    curl http://localhost:3000/auth/google
    ```

- **GET /auth/google/callback**
  - **Description**: Handles Google OAuth callback and redirects to Trello authentication.
  - **Parameters**:
    - `code` (query, required): Authorization code from Google OAuth.
  - **Responses**:
    - `302`: Redirects to Trello authentication.
    - `400`: Code not provided.
    - `500`: Failed to retrieve Google access token.

- **GET /auth/trello**
  - **Description**: Initiates Trello authentication.
  - **Responses**:
    - `302`: Redirects to Trello’s authorization URL.
    - `500`: Trello API key not configured.

- **GET /auth/trello/redirect**
  - **Description**: Handles Trello authorization redirect and renders a page to process the Trello token.
  - **Responses**:
    - `200`: Renders HTML page for processing Trello token.

- **POST /auth/trello/save-token**
  - **Description**: Saves the Trello token and generates a JWT token for API access.
  - **Parameters**:
    - `token` (body, required): Trello authentication token.
  - **Responses**:
    - `200`: Returns JWT token.
      ```json
      {
        "success": true,
        "message": "Trello token saved successfully",
        "jwtToken": "<your-jwt-token>"
      }
      ```
    - `400`: Token not provided or Google authentication required.
  - **Example**:
    ```bash
    curl -X POST http://localhost:3000/auth/trello/save-token \
    -H "Content-Type: application/json" \
    -d '{"token": "<trello-token>"}'
    ```

- **GET /auth-success**
  - **Description**: Displays a success page with the JWT token after completing authentication.
  - **Parameters**:
    - `token` (query, required): JWT token to display.
  - **Responses**:
    - `200`: Renders HTML page with the JWT token.

### 2. Sync Trello Cards to Google Calendar

- **POST /api/sync/trello-to-calendar**
  - **Description**: Syncs Trello cards from a specified board to Google Calendar as events. By default, only cards with due dates are synced, but this can be overridden.
  - **Authentication**: Requires Google and Trello authentication (JWT token in `Authorization` header).
  - **Parameters**:
    - `boardId` (body, required): ID of the Trello board to sync.
    - `dueOnly` (body, optional, default: `true`): If `true`, only cards with due dates are synced; if `false`, all cards are synced.
  - **Example Request Body**:
    ```json
    {
      "boardId": "<trello-board-id>",
      "dueOnly": true
    }
    ```
  - **Responses**:
    - `200`: Synchronization completed successfully.
      ```json
      {
        "message": "Synchronization completed",
        "totalCards": 5,
        "results": [
          {
            "trelloCard": "Task Name",
            "googleEventId": "<google-event-id>",
            "success": true
          },
          {
            "trelloCard": "Another Task",
            "error": "Failed to create event",
            "success": false
          }
        ]
      }
      ```
    - `400`: Board ID required.
    - `401`: Not authenticated with Google or Trello, or token not found.
    - `500`: Failed to sync Trello cards to Google Calendar.
  - **Example**:
    ```bash
    curl -X POST http://localhost:3000/api/sync/trello-to-calendar \
    -H "Authorization: Bearer <your-jwt-token>" \
    -H "Content-Type: application/json" \
    -d '{"boardId": "<trello-board-id>", "dueOnly": true}'
    ```

## Project Structure

- `/routes/api.js`: Contains endpoints for Trello and Google Calendar operations, including synchronization.
- `/routes/auth.js`: Handles authentication flows for Google and Trello.
- `/routes/catalog.js`: Provides the API catalog and documentation interface.
- `index.js`: Main application file that sets up the Express server and middleware.
- `/config`: Configuration files for Google OAuth, Trello API, and JWT.
- `/public`: Static files, including `index.html` for the root route.

## Example Workflow

1. **Authentication**:
   - Visit `/auth/google` to authenticate with Google.
   - After Google authentication, you’re redirected to `/auth/trello`.
   - After Trello authentication, receive a JWT token at `/auth-success`.

2. **Sync Trello Cards**:
   - Use the JWT token to make a POST request to `/api/sync/trello-to-calendar` with the desired Trello board ID.
   - Trello cards with due dates (or all cards if `dueOnly` is `false`) will be created as events in Google Calendar.

3. **Manage Events**:
   - Use endpoints like `/api/calendar/events` to retrieve, update, or delete Google Calendar events.
   - Use endpoints like `/api/trello/boards` to manage Trello boards, lists, and cards.

## Troubleshooting

- **Authentication Errors**:
  - Ensure Google and Trello API credentials are correctly configured in the `.env` file.
  - Verify that the redirect URI matches in Google Cloud Console and Trello app settings.

- **Token Issues**:
  - If you receive a `401` error, check that the JWT token is valid and included in the `Authorization` header.
  - Use `/api/reauthenticate` to check which service requires re-authentication.

- **Synchronization Failures**:
  - Ensure the Trello board ID is correct and accessible with the provided token.
  - Confirm that the Google Calendar API is enabled and the access token hasn’t expired.

## Future Enhancements

- Add support for syncing Google Calendar events back to Trello cards.
- Implement real-time updates using webhooks for Trello and Google Calendar.
- Improve error handling with more detailed error messages.
- Add support for selecting custom calendars (beyond the primary calendar).

## Contributing

Contributions are welcome! Please submit pull requests or open issues in the repository for bug reports, feature requests, or suggestions.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.