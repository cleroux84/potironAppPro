const client = require('./db.js');
const fetch = require('node-fetch');
require('dotenv').config();

const MS365CLIENTID = process.env.MS365_CLIENT_ID;
const MS365TENANTID = process.env.MS365_TENANT_ID; 
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

let accessTokenMS365 = "eyJ0eXAiOiJKV1QiLCJub25jZSI6Im1iMzdqSkEyT21NMmdmMHA3cXMzTURZYTU4aFp2UTFJZEUxWkFtMDB5WnciLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9kZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUvIiwiaWF0IjoxNzI3NDE5MjMxLCJuYmYiOjE3Mjc0MTkyMzEsImV4cCI6MTcyNzQyMzM4MCwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhZQUFBQXQ2aDlFOUp2eE1zSkI2amQxZXl2cUJDVDZJS09qQ2VNVkMzajFNdzluQi9HUGFGczdPT0FydlFrYzlhVzEvSW5BTjdrQm96V3FhcUozT3pWTS9HckJ0dDlmSzRveVB1eTlKZkZzNU1yeFlzPSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoicG90aXJvbk1haWxQcm8iLCJhcHBpZCI6IjVjYWRmNmU2LWFhOTYtNGZmOS05YWY0LWNlOWVlOTA3MjU2MyIsImFwcGlkYWNyIjoiMSIsImZhbWlseV9uYW1lIjoiTEVST1VYIiwiZ2l2ZW5fbmFtZSI6IkPDqWxpbmUiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIyYTAxOmUwYTplYjE6NTBjMDo4ZDZkOjFkY2I6YmY2NDplNGUiLCJuYW1lIjoiQ8OpbGluZSBMRVJPVVgiLCJvaWQiOiI1YjNlYTYwZS05NjdjLTRjNjItOGMwYy1kOGQwZWQ1ZjU0NzMiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzIwMDFFOTQ3OTI1RSIsInJoIjoiMC5BWE1BQnJocjNldlZfVXF5dGNNRkpBZHZaUU1BQUFBQUFBQUF3QUFBQUFBQUFBQnpBQ2suIiwic2NwIjoiTWFpbC5TZW5kIFVzZXIuUmVhZCBwcm9maWxlIG9wZW5pZCBlbWFpbCIsInNpZ25pbl9zdGF0ZSI6WyJrbXNpIl0sInN1YiI6InRnWDRmUWFCYW9YOWVLLWI0UldhYUgyLWc4cTdyVlBYU2VmSkNDNDdmaHciLCJ0ZW5hbnRfcmVnaW9uX3Njb3BlIjoiRVUiLCJ0aWQiOiJkZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUiLCJ1bmlxdWVfbmFtZSI6ImMubGVyb3V4QHBvdGlyb24uY29tIiwidXBuIjoiYy5sZXJvdXhAcG90aXJvbi5jb20iLCJ1dGkiOiJmeEtNeTdXNUhrcXpBdGx6Q01wRUFBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2lkcmVsIjoiMSAxMiIsInhtc19zdCI6eyJzdWIiOiI2RGF6bjdlSWdKdDFDVThTdzAzSXlEQnZGMVEwOXhsRkJwUEg3aW9NYy1nIn0sInhtc190Y2R0IjoxNjAwMTc4NDE1LCJ4bXNfdGRiciI6IkVVIn0.FOhLVStIJaNT9GO2qL6VF3-Tl3CA1V58-yoAbQ5mJBkfnEwC-TFgexfYTF0GrSCL8fWaBkeZrL6Om_sOzEmaMlHmPolCWutEQ7EnGyzatVcMHLQw3_HecV9y98E-OCRlzvAQsd-RLoyhXnvvArO2FQcy-weeO4i8zG0ETGGlRa1BPBYLWw-YDO4YEN_DOGzZkvX9yuobI70ngYk6QmaUlL5KxJNUcD9FRXnmAf7SRL_RyNneE-E4ygPSF6Nq09u3G6gJkswjhUxET5-8e5E9qRXer_snj5y-arkZY9_DK6-U9Rex4XrYwq88O93N8hurELxoOG6ExiVq9oGb3YDXwA"

const getRefreshTokenMS365 = async () => {
    try {
        const res = await client.query('SELECT refresh_token_ms365 FROM tokens LIMIT 1')
        return res.rows[0].refresh_token_ms365;
    } catch (error) {
        console.log('Error retrieving refresh_token_ms365', error);
        return null;
    }
}
let refresTokenMS365 = getRefreshTokenMS365();

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