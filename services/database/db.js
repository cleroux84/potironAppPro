//connexion to Render DB
const { Client } = require('pg');
const DB_USERNAME = process.env.DB_USERNAME;
const DB_HOST = process.env.DB_HOST;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_PORT = process.env.DB_PORT;

const client = new Client({
    user: DB_USERNAME,
    password: DB_PASSWORD,
    host: DB_HOST,
    port: DB_PORT,
    database: DB_DATABASE,
    ssl: {
      rejectUnauthorized: false
    }
  })
  
  client.connect()
  .then(() => console.log('Connectd to Database'))
  .catch((err) => console.error('Connection error', err.stack));

  module.exports = client;