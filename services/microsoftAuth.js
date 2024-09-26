const client = require('./db.js');
const fetch = require('node-fetch');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

let accessTokenMS365 = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IlZEZTNPVXRfbHBUMWhhd0tueHFReHdWUFBDQVdtMm9HTVJfX3BRcWsxbWciLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9kZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUvIiwiaWF0IjoxNzI3MzYxNzQ0LCJuYmYiOjE3MjczNjE3NDQsImV4cCI6MTcyNzM2NjY0NywiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhZQUFBQVIraFZZbGp4N0dCN0Z1V3hENll0NnV4YzJHakFxbSt2VmZ5L2lxMzV1Vml2aHRoelJWdEhYTkdLRXVadkphbGM0SEdzd3A2cWRkQjUyanFZWXZRbHJrQVV3My8vYlZzNXlDMzNNbmU3bnpjPSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoicG90aXJvbk1haWxQcm8iLCJhcHBpZCI6IjVjYWRmNmU2LWFhOTYtNGZmOS05YWY0LWNlOWVlOTA3MjU2MyIsImFwcGlkYWNyIjoiMSIsImZhbWlseV9uYW1lIjoiTEVST1VYIiwiZ2l2ZW5fbmFtZSI6IkPDqWxpbmUiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIyYTAxOmUwYTplYjE6NTBjMDo4ZDZkOjFkY2I6YmY2NDplNGUiLCJuYW1lIjoiQ8OpbGluZSBMRVJPVVgiLCJvaWQiOiI1YjNlYTYwZS05NjdjLTRjNjItOGMwYy1kOGQwZWQ1ZjU0NzMiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzIwMDFFOTQ3OTI1RSIsInJoIjoiMC5BWE1BQnJocjNldlZfVXF5dGNNRkpBZHZaUU1BQUFBQUFBQUF3QUFBQUFBQUFBQnpBQ2suIiwic2NwIjoiTWFpbC5TZW5kIFVzZXIuUmVhZCBwcm9maWxlIG9wZW5pZCBlbWFpbCIsInNpZ25pbl9zdGF0ZSI6WyJrbXNpIl0sInN1YiI6InRnWDRmUWFCYW9YOWVLLWI0UldhYUgyLWc4cTdyVlBYU2VmSkNDNDdmaHciLCJ0ZW5hbnRfcmVnaW9uX3Njb3BlIjoiRVUiLCJ0aWQiOiJkZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUiLCJ1bmlxdWVfbmFtZSI6ImMubGVyb3V4QHBvdGlyb24uY29tIiwidXBuIjoiYy5sZXJvdXhAcG90aXJvbi5jb20iLCJ1dGkiOiJqR0pmbWN3WGcwbVhLenFNd1Rnd0FBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2lkcmVsIjoiMTAgMSIsInhtc19zdCI6eyJzdWIiOiI2RGF6bjdlSWdKdDFDVThTdzAzSXlEQnZGMVEwOXhsRkJwUEg3aW9NYy1nIn0sInhtc190Y2R0IjoxNjAwMTc4NDE1LCJ4bXNfdGRiciI6IkVVIn0.Os1aLVrVk2KebTmi9VOSPVyL9DXwm66PEz6XrzOLgIFw-cbPhzCFJOJkQqHoEYMxrroHJU7Jzi05Cvhk3qfkAt2Y3Q0r_PFNYP2qc1Aud8RqZ478NGV7gND6H-R89Ev8Rm6Cj3j4P66jg3DZ_7h83eSMq9rCbTpCiyrklRmlaYlCS96zfviXT0utpw8T-skNZh8FMeXpOnVsWr6RnaW4VInobdJyVjLqoprFYivbKgaxtcLFmUidNt6mOJMB07D1Oo3rSbk3cOf95bXISks5z-zbFueAseIuV38fCZRiB4KZjpT2Tw8xpsUGqo668tmfIIgzsvFLbuMWAIfkufvuxA"
let refresTokenMS365 = null;

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