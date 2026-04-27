<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #24292e;
        max-width: 900px;
        margin: 0 auto;
        padding: 40px 20px;
        background-color: #ffffff;
    }
    h1 { border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; color: #0366d6; }
    h2 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 24px; color: #24292e; }
    h3 { margin-top: 20px; color: #444; }
    code {
        background-color: rgba(27, 31, 35, 0.05);
        border-radius: 3px;
        padding: 0.2em 0.4em;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 85%;
    }
    pre {
        background-color: #f6f8fa;
        border-radius: 6px;
        padding: 16px;
        overflow: auto;
        line-height: 1.45;
        border: 1px solid #dfe1e4;
    }
    pre code {
        background-color: transparent;
        padding: 0;
        font-size: 90%;
        color: #24292e;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 15px 0;
    }
    table th, table td {
        padding: 10px;
        border: 1px solid #dfe1e4;
        text-align: left;
    }
    table th { background-color: #f6f8fa; }
    .badge {
        display: inline-block;
        padding: 2px 8px;
        font-weight: bold;
        border-radius: 20px;
        font-size: 12px;
        margin-right: 5px;
    }
    .badge-check { background-color: #28a745; color: white; }
    .status-pill {
        font-size: 0.8em;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e1e4e8;
    }
    .method-get { color: #61affe; font-weight: bold; }
    .method-post { color: #49cc90; font-weight: bold; }
    .method-patch { color: #50e3c2; font-weight: bold; }
    .method-delete { color: #f93e3e; font-weight: bold; }
    ul li { margin-bottom: 8px; }
    .warning {
        background-color: #fffbdd;
        border: 1px solid #d9d0a5;
        padding: 10px 15px;
        border-radius: 6px;
        margin: 15px 0;
    }
</style>
</head>
<body>

<h1>✈️ Airport Carpooling Backend API</h1>
<p>A robust RESTful API built with <strong>Node.js</strong>, <strong>Express</strong>, and <strong>PostgreSQL</strong> to manage ride-sharing logistics for airport transfers.</p>

<h2>🚀 Core Features</h2>
<ul>
    <li><span class="badge badge-check">✓</span> <strong>Secure Auth:</strong> JWT implementation with Access and Refresh tokens.</li>
    <li><span class="badge badge-check">✓</span> <strong>Dual Roles:</strong> Users can act as Drivers, Passengers, or both.</li>
    <li><span class="badge badge-check">✓</span> <strong>Smart Search:</strong> Filter rides by airport, date, and seat availability.</li>
    <li><span class="badge badge-check">✓</span> <strong>Booking Flow:</strong> Complete request, acceptance, and rejection workflow.</li>
    <li><span class="badge badge-check">✓</span> <strong>Notifications:</strong> In-app event system for booking updates.</li>
</ul>

<h2>🛠️ Tech Stack</h2>
<table>
    <tr>
        <th>Layer</th>
        <th>Technology</th>
    </tr>
    <tr>
        <td><strong>Runtime</strong></td>
        <td>Node.js (v16+)</td>
    </tr>
    <tr>
        <td><strong>Database</strong></td>
        <td>PostgreSQL (v12+)</td>
    </tr>
    <tr>
        <td><strong>ORM/Query</strong></td>
        <td>pg (node-postgres)</td>
    </tr>
    <tr>
        <td><strong>Validation</strong></td>
        <td>Joi</td>
    </tr>
    <tr>
        <td><strong>Security</strong></td>
        <td>Bcrypt & JWT</td>
    </tr>
</table>

<h2>📋 Quick Start</h2>

<h3>1. Installation</h3>
<pre><code>npm install</code></pre>

<h3>2. Environment Setup</h3>
<p>Create a <code>.env</code> file in the root:</p>
<pre><code>PORT=3000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=airport_carpooling
JWT_SECRET=access_secret_key
JWT_REFRESH_SECRET=refresh_secret_key</code></pre>

<h3>3. Database Initialization</h3>
<pre><code># Create tables and seed data
npm run setup</code></pre>

<h2>📚 API Endpoints</h2>

<h3>Authentication</h3>
<table>
    <tr>
        <th>Method</th>
        <th>Route</th>
        <th>Description</th>
    </tr>
    <tr>
        <td><span class="method-post">POST</span></td>
        <td><code>/api/v1/auth/register</code></td>
        <td>Register new user</td>
    </tr>
    <tr>
        <td><span class="method-post">POST</span></td>
        <td><code>/api/v1/auth/login</code></td>
        <td>Login & get tokens</td>
    </tr>
</table>

<h3>Rides</h3>
<table>
    <tr>
        <th>Method</th>
        <th>Route</th>
        <th>Description</th>
    </tr>
    <tr>
        <td><span class="method-get">GET</span></td>
        <td><code>/api/v1/rides</code></td>
        <td>Search available rides</td>
    </tr>
    <tr>
        <td><span class="method-post">POST</span></td>
        <td><code>/api/v1/rides</code></td>
        <td>Create a new ride (Drivers)</td>
    </tr>
    <tr>
        <td><span class="method-delete">DELETE</span></td>
        <td><code>/api/v1/rides/:id</code></td>
        <td>Cancel a ride</td>
    </tr>
</table>

<h3>Bookings</h3>
<table>
    <tr>
        <th>Method</th>
        <th>Route</th>
        <th>Description</th>
    </tr>
    <tr>
        <td><span class="method-post">POST</span></td>
        <td><code>/api/v1/rides/:id/bookings</code></td>
        <td>Request seats</td>
    </tr>
    <tr>
        <td><span class="method-patch">PATCH</span></td>
        <td><code>/api/v1/bookings/:id</code></td>
        <td>Update status (Accepted/Rejected)</td>
    </tr>
</table>

<div class="warning">
    <strong>⚠️ Security Note:</strong> Always rotate <code>JWT_SECRET</code> in production environments and ensure PostgreSQL is not exposed to the public internet.
</div>

<h2>🗄️ Project Structure</h2>
<pre><code>src/
├── controllers/    # Request handling logic
├── models/         # Database table definitions
├── routes/         # Express route declarations
├── services/       # Core business logic
├── middleware/     # Auth & Error handlers
└── seeds/          # Initial data (Airports)</code></pre>

<h2>📄 License</h2>
<p>ISC License</p>

</body>
</html>
