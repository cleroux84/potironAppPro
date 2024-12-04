// CRUD for webhook shippingbo

const fetch = require('node-fetch');
const { refreshAccessTokenWarehouse } = require('./Gma/auth.js');
const API_APP__WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;
let accessTokenWarehouse;
let refreshTokenWarehouse;


const setupShippingboWebhook = async () => {
    const tokensWarehouse = await refreshAccessTokenWarehouse();
    accessTokenWarehouse = tokensWarehouse.accessTokenWarehouse;
    refreshTokenWarehouse = tokensWarehouse.refreshTokenWarehouse;

    const webhookUrl = `https://app.shippingbo.com/update_hooks`;
    const webhookPayload = {
        object_class: 'Order',
        endpoint_url: 'https://potironapppro.onrender.com/proOrder/updateDraftOrder',
        activated: true,
        field: 'tags',
        from_value: 'Commande PRO',
        to_value: 'Commande PRO'
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


const deleteWebhook = async (webhookId) => {
    const tokensWarehouse = await refreshAccessTokenWarehouse();
    accessTokenWarehouse = tokensWarehouse.accessTokenWarehouse;
    refreshTokenWarehouse = tokensWarehouse.refreshTokenWarehouse;

    const deleteWebhookUrl = `https://app.shippingbo.com/update_hooks/${webhookId}`;
    const deleteWebhookOptions = {
        method: 'DELETE',
        headers: {
            'Content-type': 'application/json',
            Accept: 'application/json',
            'X-API-VERSION': '1',
            'X-API-APP-ID': API_APP__WAREHOUSE_ID,
            Authorization: `Bearer ${accessTokenWarehouse}`
        }
    };
    try {
        const response = await fetch(deleteWebhookUrl, deleteWebhookOptions);
        const data = await response.json();
        console.log('webhook delete', webhookId);
        } catch (error) {
        console.error('error deleting webhook', error);
    }
}

async function getWebhooks() {
    const tokensWarehouse = await refreshAccessTokenWarehouse();
    accessTokenWarehouse = tokensWarehouse.accessTokenWarehouse;
    refreshTokenWarehouse = tokensWarehouse.refreshTokenWarehouse;
    try {
      const response = await fetch('https://app.shippingbo.com/update_hooks', {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          Accept: 'application/json',
          'X-API-VERSION': '1',
          'X-API-APP-ID': API_APP__WAREHOUSE_ID,
          Authorization: `Bearer ${accessTokenWarehouse}`
        }
      });
   
      if (!response.ok) {
        console.log('error getwbehooks')
      }
   
      const data = await response.json();
      console.log('nombre de webhooks: ', data.update_hooks.length);
      return data; // retourne les webhooks pour une analyse ultérieure si nécessaire
   
    } catch (error) {
      console.error('Erreur lors de la récupération des webhooks :', error);
    }
  }

async function deleteAllWebhooks () {
    const allWebhooks = await getWebhooks();
    console.log('length', allWebhooks.update_hooks.length)
    if(allWebhooks.update_hooks.length === 0) {
        console.log('Aucun webhook à supprimer');
        return;
    }

    for(const webhook of allWebhooks.update_hooks) {
        console.log('id webhook', webhook.id)
        await deleteWebhook(webhook.id);
    }
    console.log('Tous les webhooks ont été supprimé')
}

module.exports = {
    setupShippingboWebhook,
    deleteWebhook,
    deleteAllWebhooks,
    getWebhooks
}