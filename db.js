const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST_CLEVER,
  user: process.env.DB_USER_CLEVER,
  password: process.env.DB_PASSWORD_CLEVER,
  database: process.env.DB_NAME_CLEVER,
  port: process.env.DB_PORT_CLEVER,
  waitForConnections: true,
  connectionLimit: 1,  // 👈 SOLO UNA CONEXIÓN (evita el error)
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
