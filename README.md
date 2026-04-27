# ✈️ Airport Carpooling Backend API

A robust RESTful API built with **Node.js**, **Express**, and **PostgreSQL** to manage ride-sharing logistics for airport transfers.

## 🚀 Core Features

* ✅ **Secure Auth:** JWT implementation with Access and Refresh tokens.
* ✅ **Dual Roles:** Users can act as Drivers, Passengers, or both.
* ✅ **Smart Search:** Filter rides by airport, date, and seat availability.
* ✅ **Booking Flow:** Complete request, acceptance, and rejection workflow.
* ✅ **Notifications:** In-app event system for booking updates.

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Runtime** | Node.js (v16+) |
| **Database** | PostgreSQL (v12+) |
| **ORM/Query** | pg (node-postgres) |
| **Validation** | Joi |
| **Security** | Bcrypt & JWT |

## 📋 Quick Start

### 1. Installation
```bash
npm install
2. Environment SetupCreate a .env file in the root:Extrait de codePORT=3000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=airport_carpooling
JWT_SECRET=access_secret_key
JWT_REFRESH_SECRET=refresh_secret_key
3. Database InitializationBash# Create tables and seed data
npm run setup
📚 API EndpointsAuthenticationMethodRouteDescriptionPOST/api/v1/auth/registerRegister new userPOST/api/v1/auth/loginLogin & get tokensRidesMethodRouteDescriptionGET/api/v1/ridesSearch available ridesPOST/api/v1/ridesCreate a new ride (Drivers)DELETE/api/v1/rides/:idCancel a rideBookingsMethodRouteDescriptionPOST/api/v1/rides/:id/bookingsRequest seatsPATCH/api/v1/bookings/:idUpdate status (Accepted/Rejected)[!WARNING]Security Note: Always rotate JWT_SECRET in production environments and ensure PostgreSQL is not exposed to the public internet.🗄️ Project StructurePlaintextsrc/
├── controllers/    # Request handling logic
├── models/         # Database table definitions
├── routes/         # Express route declarations
├── services/       # Core business logic
├── middleware/     # Auth & Error handlers
└── seeds/          # Initial data (Airports)
📄 LicenseISC License
### Why this works better:
1.  **Native Support:** GitHub is designed to style Markdown automatically. It will add the borders to tables, style the code blocks, and bold the text correctly.
2.  **No "Code Leak":** Since there is no `<style>` tag, you won't see that messy text at the top of your page.
3.  **Dark Mode Friendly:** This Markdown will automatically switch colors if a user 
