import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST_CLEVER,
  user: process.env.DB_USER_CLEVER,
  password: process.env.DB_PASS_CLEVER,
  database: process.env.DB_NAME_CLEVER,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 3,   // Clever Cloud solo deja máximo 5
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

export default pool;
