const oracledb = require('oracledb');
const path = require('path');

// Load .env from the root folder
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('DB USER:', process.env.DB_USER);
console.log('DB PASSWORD EXISTS:', !!process.env.DB_PASSWORD);
console.log('DB CONNECTION EXISTS:', !!process.env.DB_CONNECT_STRING);

async function getConnection() {
    return await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECT_STRING
    });
}

module.exports = { getConnection };