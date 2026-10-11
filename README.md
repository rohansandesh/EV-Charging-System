# ⚡ EV Charging Network Management System

A full-stack, location-aware EV Charging Network Management System built as a Database Management Systems (DBMS) project[cite: 28, 30, 32]. The system features a **Node.js/Express** RESTful backend integrated directly with an **Oracle Cloud Database (23c/26ai)**, complemented by a responsive web-based frontend[cite: 26, 28, 30, 32].

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** HTML5, CSS3 (Dark Theme), JavaScript (ES6+), LocalStorage API.
* **Backend:** Node.js, Express.js, CORS, Body-Parser, Dotenv[cite: 28, 30].
* **Database:** Oracle Cloud Database (FreeSQL / Autonomous DB) using the official `oracledb` thin driver[cite: 26, 28, 30].
* **Database Logic:** PL/SQL Stored Procedures (`Process_EV_Billing`), Sequences (`seq_customer_id`, `seq_session_id`), and Foreign Key Constraints[cite: 30, 31].

---

## 📁 Repository Structure

```text
ev-charging-system/
├── .env                       # Oracle DB Credentials & Port config
├── backend/
│   ├── db.js                  # Oracle Connection Factory (node-oracledb)
│   ├── server.js              # REST API endpoints & Express server
│   ├── package.json           # Backend dependencies
│   └── package-lock.json      # Dependency lock file
├── database/
│   └── schema.sql             # Oracle DDL schemas & PL/SQL procedures
└── Frontend/
    ├── login.html             # User Login & Registration UI
    └── dashboard.html         # Interactive Dashboard, Charging & Checkout UI

    ## ✨ Key Features

1. User Authentication & Profiles:
   * User Registration & Login with encrypted/unique email enforcement (ORA-00001 prevention).
   * Default starting wallet balance (₹1000.00) assigned upon new registration.

2. Location-Aware Station Lookup (Kerala Districts):
   * Filter charging stations dynamically across all 14 Districts of Kerala (Thiruvananthapuram, Kollam, Ernakulam, Kozhikode, etc.).
   * Parameterized SQL queries fetch location-specific chargers and live statuses.

3. Live Charging Simulation & Battery Sync:
   * Visual battery charging loop (1% increment every 2 seconds during active sessions).
   * Background discharging simulation (1% drop every 15 seconds when idle) with live database persistence.

4. Oracle PL/SQL Billing Engine & GST Calculation:
   * Automated billing executed directly inside Oracle DB via Process_EV_Billing PL/SQL Stored Procedure.
   * Computes Base kWh Charges + 18% GST with itemized breakdown.

5. Integrated Digital Wallet & UPI Payments:
   * In-app Wallet Top-Up via simulated UPI / QR Code (GPay, PhonePe, Paytm).
   * Flexible Checkout Options: Pay bills using In-App Wallet or Direct GPay/UPI QR Scan.

---

## 🗄️ Database Schema Overview

The database comprises 4 normalized tables enforcing Relational Integrity:

* CUSTOMERS: Customer_ID (PK), Name, Email (UNIQUE), Password, EV_Model, Battery_Percent, Balance.
* STATIONS: Station_ID (PK), Name, Location, District.
* CHARGERS: Charger_ID (PK), Station_ID (FK), Type ('Fast'/'Standard'), Rate_Per_kWh, Status ('Available'/'Occupied').
* SESSIONS: Session_ID (PK), Customer_ID (FK), Charger_ID (FK), Start_Time, End_Time, Energy_kWh, Total_Amount, Status ('Active'/'Completed').

---

## 🚀 Setup & Installation

### 1. Prerequisites
* Node.js (v18 or higher) installed.
* An active Oracle Cloud Database or Oracle FreeSQL account.

### 2. Database Setup
1. Open your Oracle SQL Worksheet.
2. Execute the DDL statements in database/schema.sql to create the tables, sequences, and foreign keys.
3. Compile the Process_EV_Billing PL/SQL stored procedure.

### 3. Environment Configuration
Create a .env file in the root directory:

DB_USER=YOUR_ORACLE_USERNAME
DB_PASSWORD="YOUR_ORACLE_PASSWORD"
DB_CONNECT_STRING=tcps://db.freesql.com:2484/YOUR_DB_SERVICE
PORT=3000

### 4. Backend Setup & Run
Navigate to the backend directory and install dependencies:

cd backend
npm install
node server.js

### 5. Accessing the Application
Open your browser and navigate to:
http://localhost:3000

