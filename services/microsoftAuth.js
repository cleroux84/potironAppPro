const client = require('./db.js');
const fetch = require('node-fetch');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

let accessTokenMS365 = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IlJQYmxsTGZDWWNRS1VQRFpIWVgwRm5KbzRwU0dkbTBUM2wwR3ptVlpoV0kiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9kZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUvIiwiaWF0IjoxNzI3NDIyNTA4LCJuYmYiOjE3Mjc0MjI1MDgsImV4cCI6MTcyNzQyNzQyNSwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhZQUFBQVo3ZTVwY3ZvbTA4VUZFQ2MxQ3lFZTgvMGZOQlk4UTE5VnQrZmExdzgwNWZ2QU9Jckh1V0duK05xZmdrcmNjcHNwb1RLTk1jZGEwOUlOT2M4c1YwSmZVcGw1ai9GMzlsWERsR0x1NEdpR2R3PSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoicG90aXJvbk1haWxQcm8iLCJhcHBpZCI6IjVjYWRmNmU2LWFhOTYtNGZmOS05YWY0LWNlOWVlOTA3MjU2MyIsImFwcGlkYWNyIjoiMSIsImZhbWlseV9uYW1lIjoiUGFyaXMiLCJnaXZlbl9uYW1lIjoiUG90aXJvbiIsImlkdHlwIjoidXNlciIsImlwYWRkciI6IjJhMDE6ZTBhOmViMTo1MGMwOjhkNmQ6MWRjYjpiZjY0OmU0ZSIsIm5hbWUiOiJQb3Rpcm9uIFBhcmlzIiwib2lkIjoiNWY2ZDgwMTctYTkwNC00ZDZhLTk3MDEtNjQ0YjI4MGY5MDczIiwicGxhdGYiOiIzIiwicHVpZCI6IjEwMDMyMDAxOUM4RjU2QzEiLCJyaCI6IjAuQVhNQUJyaHIzZXZWX1VxeXRjTUZKQWR2WlFNQUFBQUFBQUFBd0FBQUFBQUFBQUJ6QU5RLiIsInNjcCI6Ik1haWwuU2VuZCBVc2VyLlJlYWQgcHJvZmlsZSBvcGVuaWQgZW1haWwiLCJzdWIiOiJ3NjhWc1VnN3FUQkxhX2Q0Qzd3VHJEc3JNNGdmNU8wSzNiVTdwLW8tSWdzIiwidGVuYW50X3JlZ2lvbl9zY29wZSI6IkVVIiwidGlkIjoiZGQ2YmI4MDYtZDVlYi00YWZkLWIyYjUtYzMwNTI0MDc2ZjY1IiwidW5pcXVlX25hbWUiOiJib25qb3VyQHBvdGlyb24uY29tIiwidXBuIjoiYm9uam91ckBwb3Rpcm9uLmNvbSIsInV0aSI6ImJVRFBhNFl4dVV1dlpWQnJ2NlpHQUEiLCJ2ZXIiOiIxLjAiLCJ3aWRzIjpbImI3OWZiZjRkLTNlZjktNDY4OS04MTQzLTc2YjE5NGU4NTUwOSJdLCJ4bXNfaWRyZWwiOiIxIDE4IiwieG1zX3N0Ijp7InN1YiI6IklpdHRRamlva2ZBSW9KSVloVUhoWnEzMDBCeC0wZWgwbGdNNzFZOFBHczgifSwieG1zX3RjZHQiOjE2MDAxNzg0MTUsInhtc190ZGJyIjoiRVUifQ.bwayL2eMgw24_awM3pG7wtDiQLLfSpJtVwPYXSAK0i_LvP3k1jQBO2T0iU4XvuwL8Zqdl_jHRX0H-yPW6mh_S5CyjizlKMgjMUnjwmTe1CIkWRWFV9hlDIDBERhulqX8VeNjIPinkkF2zHhSY3DNptAu91i5ERj8PmXDh13KLKrUic8xj1Y1Qkf10g65AjcH7L4M-9Z9ExXd6WYNVRvpbhdDkr2vcPYR2jkZmiP1i-fJdsU9HMtowcT4wzLznYsfFnrKOIvgWT_NfHKf6SZS1r6fevIWuYe1DukxUZCiDPnzf3pVVIxnrILBgUcBLvbYBiEDTyKTnR4mqXrZkyMCwQ"
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
    console.log('before ms365', refresTokenMS365);
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
            console.log('after ms365', refresTokenMS365);

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