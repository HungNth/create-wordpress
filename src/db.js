import mysql from 'mysql2/promise';

/**
 * Creates and returns a mysql2 connection based on config.
 * Uses socket on macOS if db_socket is set; otherwise TCP.
 * @param {object} config
 * @returns {Promise<import('mysql2/promise').Connection>}
 */
export async function createDbConnection(config) {
  const connectionOptions = {
    port: config.database_port || 3306,
    user: config.db_username || 'root',
    password: config.db_password || '',
  };

  // Use Unix socket on non-Windows if configured
  if (config.db_socket && process.platform !== 'win32') {
    connectionOptions.socketPath = config.db_socket;
  } else {
    connectionOptions.host = '127.0.0.1';
  }

  try {
    const connection = await mysql.createConnection(connectionOptions);
    return connection;
  } catch (err) {
    throw new Error(`Cannot connect to MySQL: ${err.message}`);
  }
}

/**
 * Checks whether a database with the given name already exists.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} dbName
 * @returns {Promise<boolean>}
 */
export async function databaseExists(connection, dbName) {
  const [rows] = await connection.execute(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    [dbName]
  );
  return rows.length > 0;
}

/**
 * Creates a new database with utf8mb4 charset.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} dbName
 */
export async function createDatabase(connection, dbName) {
  await connection.execute(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}
