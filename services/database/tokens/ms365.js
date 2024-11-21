//Requests for tokens table concerning microsoft auth MS365
const client = require('../db.js');

//get token from DB
const getTokenMS365FromDb = async () => {
    try {
        const res = await client.query('SELECT token_ms365 FROM tokens LIMIT 1');
        return res.rows[0].token_ms365;
      } catch (error) {
        console.log('Error retrieving token_ms365 from DB', error);
        return null;
      }
}

//get refresk token from DB
const getRefreshTokenMS365 = async () => {
    try {
        const res = await client.query('SELECT refresh_token_ms365 FROM tokens LIMIT 1')
        return res.rows[0].refresh_token_ms365;
    } catch (error) {
        console.log('Error retrieving refresh_token_ms365', error);
        return null;
    }
}

//save access and refresh token in DB
const saveAccessAndRefreshTokenMS365 = async (token, refreshToken) => {
    try {
        await client.query('UPDATE tokens SET refresh_token_ms365 =$1 where ID = 1', [refreshToken]);
        console.log('RefreshToken saved in db for MS365');
        await client.query('UPDATE tokens SET token_ms365 =$1 where ID = 1', [token]);
        console.log('token saved in db for MS365');
    } catch (error) {
        console.error('Error saving refreshTokenMS365 in db', error);
    }
}

module.exports = {
    getTokenMS365FromDb,
    getRefreshTokenMS365,
    saveAccessAndRefreshTokenMS365
}
