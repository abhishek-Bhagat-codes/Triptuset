const mysql = require('mysql2');

const conn = mysql.createConnection({
  host: 'localhost',     
  user: 'root',          
  password: '',          
  database: 'te_db'      
});

conn.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.stack);
    return;
  }
  console.log('Connected to MySQL as ID ' + conn.threadId);
});

module.exports = conn;
