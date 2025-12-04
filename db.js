const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  connectionLimit: 5, // 💥 IMPORTANTE: NO usar más conexiones que las permitidas
  waitForConnections: true,
  queueLimit: 0
});

module.exports = pool;
