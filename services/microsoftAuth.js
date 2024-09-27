const client = require('./db.js');
const fetch = require('node-fetch');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

let accessTokenMS365 = null;
let refresTokenMS365 = null;

const getRefreshTokenMS365 = async () => {
    try {
        const res = await client.query('SELECT refresh_token_ms365 FROM tokens LIMIT 1')
        return res.rows[0].refresh_token_ms365;
    } catch (error) {
        console.log('Error retrieving refresh_token_ms365', error);
        return null;
    }
}

const setAccessTokenMS365 = (token) => {
    accessTokenMS365 = token;
}

const getAccessTokenMS365 = () => {
    return accessTokenMS365;
}

const saveRefreshTokenMS365 = async (token) => {
    try {
        await client.query('UPDATE tokens SET refresh_token_ms365 =$1 where ID = 1', [token]);
        console.log('RefreshToken saved in db for MS365');
    } catch (error) {
        console.error('Error saving refreshTokenMS365 in db', error);
    }
}

const refreshMS365AccessToken = async () => {
    if(!refresTokenMS365) {
        refresTokenMS365 = await getRefreshTokenMS365();
    }
    const tokenMS365Url = `https://login.microsoftonline.com/${MS365TENANTID}/oauth2/v2.0/token`;
    const refreshMS365Options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: MS365CLIENTID,
            scope: 'https://graph.microsoft.com/.default',
            refresh_token: refresTokenMS365,
            grant_type: 'refresh_token',
            client_secret: MS365SECRET
          }).toString()
    };

    try {
        const response = await fetch(tokenMS365Url, refreshMS365Options);
        const data = await response.json();
        if(response.ok) {
            accessTokenMS365 = data.access_token;
            refresTokenMS365 = data.refresh_token;
            await saveRefreshTokenMS365(data.refresh_token);
            console.log('Access token MS365 refreshed successfully');
        } else {
            console.error('Error refreshing token MS365', data);
        }
    } catch (error) {
        console.error('Error obtaining access token MS365:', error);
    }
} 

module.exports = {
    refreshMS365AccessToken,
    setAccessTokenMS365,
    getAccessTokenMS365
}