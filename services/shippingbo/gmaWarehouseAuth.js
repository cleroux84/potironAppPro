const client = require('../db.js');

const saveRefreshTokenWarehouseDb = async (token) => {
    try {
      await client.query('UPDATE tokens SET refresh_token_warehouse = $1 WHERE id = 1', [token]);
      console.log('RefreshToken saved in db for GMA Warehouse');
    } catch (error) {
      console.error('Error saving refreshTokenWarehouse in db', error);
    }
  }
  
  const getRefreshTokenWarehouseFromDb = async () => {
    try {
      const res = await client.query('SELECT refresh_token_warehouse FROM tokens LIMIT 1');
      return res.rows[0].refresh_token_warehouse;
    } catch (error) {
      console.log('Error retrieving refresh_token_warehouse', error);
      return null;
    }
  }

  module.exports = {
    saveRefreshTokenWarehouseDb,
    getRefreshTokenWarehouseFromDb
  };