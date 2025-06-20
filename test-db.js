// Test script to verify database and auth implementation
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Construct the database path
const dbPath = path.join(os.homedir(), 'Library/Application Support/euphoria-pos/pos.sqlite');
console.log('Looking for database at:', dbPath);

try {
  // Open the database
  const db = new Database(dbPath, { readonly: true });
  
  // Check if tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\nTables found:', tables.map(t => t.name));
  
  // Check employees
  const employees = db.prepare("SELECT id, employeeCode, firstName, lastName FROM employees").all();
  console.log('\nEmployees:', employees);
  
  // Check outbox messages
  const outboxCount = db.prepare("SELECT COUNT(*) as count FROM outbox").get();
  console.log('\nOutbox messages:', outboxCount.count);
  
  // Check pos_config
  const config = db.prepare("SELECT * FROM pos_config").all();
  console.log('\nPOS Config:', config);
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
  console.log('\nThe database might not exist yet. Make sure the Electron app has started successfully.');
}