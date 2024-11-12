const fetch = require('node-fetch');
const API_APP__WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;


const setupShippingboWebhook = async (accessTokenWarehouse) => {
    console.log('passe ici', accessTokenWarehouse);
    const webhookUrl = `https://app.shippingbo.com/update_hooks`;
    const webhookPayload = {
        object_class: 'ReturnOrder',
        endpoint_url: 'https://potironapppro.onrender.com/returnOrderCancel',
        activated: true,
        field: 'State'
    };
    const webhookOptions = {
        method: 'POST',
        headers: {
            'Content-type': 'application/json',
            Accept: 'application/json',
            'X-API-VERSION': '1',
            'X-API-APP-ID': API_APP__WAREHOUSE_ID,
            Authorization: `Bearer ${accessTokenWarehouse}`
        },
        body: JSON.stringify(webhookPayload)
    };

    try {
        const response = await fetch(webhookUrl, webhookOptions);
        const data = await response.json();
        console.log('webhook', data);
    } catch(error) {
        console.error("error creating webhook", error)
    }
}

module.exports = {
    setupShippingboWebhook
}