const client = require('./db.js');
const fetch = require('node-fetch');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

const accessTokenMS365 = "eyJ0eXAiOiJKV1QiLCJub25jZSI6Ind0Y1lETXFXQVVJbVg2ZHVjRlptZ2Z4VFBPWXJtTkJueGRUT0tIS0MweTAiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9kZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUvIiwiaWF0IjoxNzI3MzYxMTQzLCJuYmYiOjE3MjczNjExNDMsImV4cCI6MTcyNzM2NTY1NCwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhZQUFBQUNqN2VZNzI4T3U0cnVKaEMvYkl5d2Y4OG5CMkQzL3JONW05WTl6ZXI2Z3RiYnduOUNpYytybXBMT3NLaWZ5M2c2bENaR0lvN29icjZ0eE5qSmhQeFhBRGdZNmFzWjVYYWF1ZVpRSEphMDRjPSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoicG90aXJvbk1haWxQcm8iLCJhcHBpZCI6IjVjYWRmNmU2LWFhOTYtNGZmOS05YWY0LWNlOWVlOTA3MjU2MyIsImFwcGlkYWNyIjoiMSIsImZhbWlseV9uYW1lIjoiTEVST1VYIiwiZ2l2ZW5fbmFtZSI6IkPDqWxpbmUiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIyYTAxOmUwYTplYjE6NTBjMDo4ZDZkOjFkY2I6YmY2NDplNGUiLCJuYW1lIjoiQ8OpbGluZSBMRVJPVVgiLCJvaWQiOiI1YjNlYTYwZS05NjdjLTRjNjItOGMwYy1kOGQwZWQ1ZjU0NzMiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzIwMDFFOTQ3OTI1RSIsInJoIjoiMC5BWE1BQnJocjNldlZfVXF5dGNNRkpBZHZaUU1BQUFBQUFBQUF3QUFBQUFBQUFBQnpBQ2suIiwic2NwIjoiTWFpbC5TZW5kIFVzZXIuUmVhZCBwcm9maWxlIG9wZW5pZCBlbWFpbCIsInNpZ25pbl9zdGF0ZSI6WyJrbXNpIl0sInN1YiI6InRnWDRmUWFCYW9YOWVLLWI0UldhYUgyLWc4cTdyVlBYU2VmSkNDNDdmaHciLCJ0ZW5hbnRfcmVnaW9uX3Njb3BlIjoiRVUiLCJ0aWQiOiJkZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUiLCJ1bmlxdWVfbmFtZSI6ImMubGVyb3V4QHBvdGlyb24uY29tIiwidXBuIjoiYy5sZXJvdXhAcG90aXJvbi5jb20iLCJ1dGkiOiJOT1JiVmhWRjRVT3QybzYyVjVVdkFBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2lkcmVsIjoiMSA0IiwieG1zX3N0Ijp7InN1YiI6IjZEYXpuN2VJZ0p0MUNVOFN3MDNJeURCdkYxUTA5eGxGQnBQSDdpb01jLWcifSwieG1zX3RjZHQiOjE2MDAxNzg0MTUsInhtc190ZGJyIjoiRVUifQ.S5pnLRPSrcQEcNi_4VW741hbfSklNHIcKiRLfjAY3BfzKIIPsJU1eMzrDTaaoUjrDnSxrDuFRS-hXlQyT7Eo9UYWjvAHX0vDcF_XBxIzsH9Pqxdi2fML7nl5umCy87nhBuLwdrTlzTbEvag2Mh9PoGAHfdL-vp2ZRbgv45ZZ3OZRKq71uPOiBcxGW8OA5vt5Ovvx-rWoeY-WFBlmsvTzplKMDdYlBL5BWw7x65rTaAESIzlXdQmsJrGEUH5Pr_Y8D8bAcEu9rcRiKkgk1JXluzZ3O8WGP9KkuORr5OTjixQkbsdxrdzQycSCV6_17IITaasGdkwZe7UOGjz_Wt4ySw"

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