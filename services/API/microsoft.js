//Token gestion for MS365 API

const client = require('../database/db.js');
const fetch = require('node-fetch');
const { getRefreshTokenMS365, saveAccessAndRefreshTokenMS365 } = require('../database/tokens/ms365.js');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

let accessTokenMS365 = null;
let refresTokenMS365 = null;

const setAccessTokenMS365 = (token) => {
    accessTokenMS365 = token;
}

const getAccessTokenMS365 = async () => {
    return accessTokenMS365;
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
            await saveAccessAndRefreshTokenMS365(data.access_token, data.refresh_token);
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
    getAccessTokenMS365,
}