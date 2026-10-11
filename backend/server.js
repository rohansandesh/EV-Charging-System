const express = require('express');
const cors = require('cors');
const path = require('path');
const oracledb = require('oracledb');
const { getConnection } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../Frontend')));

// Redirect root to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Database Connection Test Route
app.get('/test-db', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(
            `SELECT table_name FROM user_tables ORDER BY table_name`
        );
        res.json({
            success: true,
            message: 'Connected to Oracle FreeSQL successfully!',
            tables: result.rows
        });
    } catch (error) {
        console.error("DB Test Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET: Fetch list of core DBMS tables and metadata
app.get('/api/db/tables', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const tables = ['CUSTOMERS', 'STATIONS', 'CHARGERS', 'SESSIONS'];
        const summary = [];

        for (const tbl of tables) {
            try {
                const countRes = await connection.execute(`SELECT COUNT(*) as "cnt" FROM ${tbl}`);
                const count = countRes.rows[0] ? (countRes.rows[0][0] || countRes.rows[0].cnt || 0) : 0;
                summary.push({ name: tbl, count });
            } catch (e) {
                summary.push({ name: tbl, count: 0, error: e.message });
            }
        }
        res.json({ success: true, tables: summary });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET: Fetch rows from a specific DBMS table for live inspector view
app.get('/api/db/table/:name', async (req, res) => {
    const rawName = (req.params.name || '').toUpperCase().trim();
    const allowed = ['CUSTOMERS', 'STATIONS', 'CHARGERS', 'SESSIONS'];
    if (!allowed.includes(rawName)) {
        return res.status(400).json({ success: false, message: 'Invalid or restricted table name.' });
    }

    let connection;
    try {
        connection = await getConnection();
        // Fetch up to 100 rows ordered by primary key or timestamp if available
        let orderBy = '';
        if (rawName === 'CUSTOMERS') orderBy = 'ORDER BY Customer_ID DESC';
        else if (rawName === 'STATIONS') orderBy = 'ORDER BY Station_ID ASC';
        else if (rawName === 'CHARGERS') orderBy = 'ORDER BY Charger_ID ASC';
        else if (rawName === 'SESSIONS') orderBy = 'ORDER BY Session_ID DESC';

        const result = await connection.execute(
            `SELECT * FROM ${rawName} ${orderBy} FETCH FIRST 100 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            success: true,
            table: rawName,
            columns: result.metaData ? result.metaData.map(m => m.name) : [],
            rows: result.rows
        });
    } catch (error) {
        console.error(`DB Table fetch error (${rawName}):`, error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET: Fetch Single User Details by ID
app.get('/api/user/:id', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", 
                    EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Customer_ID = :id`,
            [req.params.id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: User Registration
app.post('/api/register', async (req, res) => {
    const { name, email, password, model } = req.body;
    let connection;
    try {
        connection = await getConnection();
        
        await connection.execute(
            `INSERT INTO CUSTOMERS (Customer_ID, Name, Email, Password, EV_Model, Balance) 
             VALUES (seq_customer_id.NEXTVAL, :name, :email, :password, :model, 1000.00)`,
            [name, email, password, model || 'Tata Punch EV'],
            { autoCommit: true }
        );
        
        const userRes = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Email = :email`,
            [email],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ success: true, user: userRes.rows[0] });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Email = :email AND Password = :password`,
            [email, password],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Fetch Stations & Chargers Filtered by District (Case-Insensitive Fix)
app.post('/api/stations-nearby', async (req, res) => {
    const { district } = req.body;
    let connection;
    try {
        connection = await getConnection();
        
        const query = (district && district !== 'All') 
            ? `SELECT Station_ID as "id", Name as "name", Location as "location", District as "district" 
               FROM STATIONS 
               WHERE UPPER(TRIM(District)) = UPPER(TRIM(:district)) 
               ORDER BY Station_ID`
            : `SELECT Station_ID as "id", Name as "name", Location as "location", District as "district" 
               FROM STATIONS 
               ORDER BY Station_ID`;

        const bindParams = (district && district !== 'All') ? [district] : [];

        const stationsRes = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const chargersRes = await connection.execute(
            `SELECT Charger_ID as "id", Station_ID as "station_id", Type as "type", Rate_Per_kWh as "rate", Status as "status" 
             FROM CHARGERS 
             ORDER BY Charger_ID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const data = stationsRes.rows.map(station => ({
            id: station.id || station.ID,
            name: station.name || station.NAME,
            location: station.location || station.LOCATION,
            district: station.district || station.DISTRICT,
            chargers: chargersRes.rows
                .filter(c => (c.station_id || c.STATION_ID) === (station.id || station.ID))
                .map(c => ({
                    id: c.id || c.ID,
                    type: c.type || c.TYPE,
                    rate: c.rate || c.RATE,
                    status: c.status || c.STATUS
                }))
        }));

        res.json({ success: true, stations: data });
    } catch (error) {
        console.error("Error in /api/stations-nearby:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Start Charging Session
app.post('/api/sessions/start', async (req, res) => {
    const { charger_id, user_id } = req.body;
    let connection;
    try {
        connection = await getConnection();
        
        const chargerCheck = await connection.execute(
            `SELECT Status FROM CHARGERS WHERE Charger_ID = :charger_id`,
            [charger_id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (chargerCheck.rows.length === 0 || chargerCheck.rows[0].STATUS === 'Occupied' || chargerCheck.rows[0].status === 'Occupied') {
            return res.status(400).json({ success: false, message: 'Charger is currently occupied or unavailable.' });
        }

        await connection.execute(
            `UPDATE CHARGERS SET Status = 'Occupied' WHERE Charger_ID = :charger_id`,
            [charger_id],
            { autoCommit: true }
        );

        const sessionRes = await connection.execute(
            `INSERT INTO SESSIONS (Session_ID, Customer_ID, Charger_ID, Status) 
             VALUES (seq_session_id.NEXTVAL, :user_id, :charger_id, 'Active')
             RETURNING Session_ID INTO :session_id`,
            {
                user_id: parseInt(user_id),
                charger_id: parseInt(charger_id),
                session_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        res.json({ success: true, session: { session_id: sessionRes.outBinds.session_id[0] } });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Stop Charging Session & Execute PL/SQL Billing Procedure
app.post('/api/sessions/stop', async (req, res) => {
    const { session_id, energy_kwh, user_id } = req.body;
    let connection;
    try {
        connection = await getConnection();

        const sessionRes = await connection.execute(
            `SELECT c.Rate_Per_kWh as "rate", s.Charger_ID as "charger_id"
             FROM SESSIONS s 
             JOIN CHARGERS c ON s.Charger_ID = c.Charger_ID 
             WHERE s.Session_ID = :session_id`,
            [session_id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rate = sessionRes.rows[0] ? parseFloat(sessionRes.rows[0].rate || sessionRes.rows[0].RATE) : 18.0;
        const chargerId = sessionRes.rows[0] ? (sessionRes.rows[0].charger_id || sessionRes.rows[0].CHARGER_ID) : null;
        const kwh = parseFloat(energy_kwh);

        const base_amount = (kwh * rate).toFixed(2);
        const gst_amount = (parseFloat(base_amount) * 0.18).toFixed(2);
        const total_billed = (parseFloat(base_amount) + parseFloat(gst_amount)).toFixed(2);

        // Update charger status back to 'Available'
        if (chargerId) {
            await connection.execute(
                `UPDATE CHARGERS SET Status = 'Available' WHERE Charger_ID = :chargerId`,
                [chargerId],
                { autoCommit: true }
            );
        }

        // Update session status to 'Completed'
        await connection.execute(
            `UPDATE SESSIONS SET Status = 'Completed' WHERE Session_ID = :session_id`,
            [session_id],
            { autoCommit: true }
        );

        // Execute PL/SQL Procedure if present
        try {
            await connection.execute(
                `BEGIN
                    Process_EV_Billing(:session_id, :energy_kwh);
                 END;`,
                {
                    session_id: parseInt(session_id),
                    energy_kwh: kwh
                },
                { autoCommit: true }
            );
        } catch (plsqlErr) {
            console.warn("PL/SQL Procedure warning (continuing fallback execution):", plsqlErr.message);
        }

        const userRes = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Customer_ID = :user_id`,
            [user_id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ 
            success: true, 
            total_billed: total_billed, 
            bill: {
                energy_kwh: kwh.toFixed(2),
                rate_per_kwh: rate.toFixed(2),
                base_amount: base_amount,
                gst_amount: gst_amount,
                total_billed: total_billed
            },
            user: userRes.rows[0] 
        });
    } catch (error) {
        console.error("Billing Process Error:", error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Add Funds to Customer Wallet
app.post('/api/wallet/add', async (req, res) => {
    const { user_id, amount } = req.body;
    let connection;
    try {
        if (!user_id || !amount) {
            return res.status(400).json({ success: false, message: 'User ID and Amount are required.' });
        }

        connection = await getConnection();
        await connection.execute(
            `UPDATE CUSTOMERS SET Balance = Balance + :amount WHERE Customer_ID = :user_id`,
            [parseFloat(amount), parseInt(user_id)],
            { autoCommit: true }
        );

        const userRes = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Customer_ID = :user_id`,
            [parseInt(user_id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ success: true, user: userRes.rows[0] });
    } catch (error) {
        console.error("Wallet Add Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Deduct Funds from Customer Wallet on Bill Payment
app.post('/api/wallet/deduct', async (req, res) => {
    const { user_id, amount } = req.body;
    let connection;
    try {
        if (!user_id || !amount) {
            return res.status(400).json({ success: false, message: 'User ID and Amount are required.' });
        }

        connection = await getConnection();

        const checkRes = await connection.execute(
            `SELECT Balance as "balance" FROM CUSTOMERS WHERE Customer_ID = :user_id`,
            [parseInt(user_id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const row = checkRes.rows[0];
        const currentBalance = row ? parseFloat(row.balance !== undefined ? row.balance : row.BALANCE) : 0;
        
        if (currentBalance < parseFloat(amount)) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
        }

        await connection.execute(
            `UPDATE CUSTOMERS SET Balance = Balance - :amount WHERE Customer_ID = :user_id`,
            [parseFloat(amount), parseInt(user_id)],
            { autoCommit: true }
        );

        const userRes = await connection.execute(
            `SELECT Customer_ID as "id", Name as "name", Email as "email", EV_Model as "model", Battery_Percent as "battery", Balance as "balance" 
             FROM CUSTOMERS WHERE Customer_ID = :user_id`,
            [parseInt(user_id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ success: true, user: userRes.rows[0] });
    } catch (error) {
        console.error("Wallet Deduct Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST: Update Customer Battery Percentage
app.post('/api/user/update-battery', async (req, res) => {
    const { user_id, battery } = req.body;
    let connection;
    try {
        if (!user_id) {
            return res.status(400).json({ success: false, message: 'User ID is required.' });
        }

        connection = await getConnection();
        await connection.execute(
            `UPDATE CUSTOMERS SET Battery_Percent = :battery WHERE Customer_ID = :user_id`,
            [parseInt(battery), parseInt(user_id)],
            { autoCommit: true }
        );
        res.json({ success: true, battery });
    } catch (error) {
        console.error("Battery Sync Error:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally { // FIXED: changed 'finale' to 'finally'
        if (connection) await connection.close();
    }
});

// GET: Fetch Active Session for Current User
app.get('/api/sessions/active/:user_id', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(
            `SELECT Session_ID as "session_id", Charger_ID as "charger_id" 
             FROM SESSIONS 
             WHERE Customer_ID = :user_id AND Status = 'Active'`,
            [parseInt(req.params.user_id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, activeSession: null });
        }
        res.json({ success: true, activeSession: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});