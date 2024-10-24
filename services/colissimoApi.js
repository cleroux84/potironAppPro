const fetch = require('node-fetch');

const colissimoApiKey = process.env.CBOX_API_KEY;

const createLabel = async (senderCustomer, recipientPotiron, parcel) => {
    const data = {
        "shipment": {
            "sender": senderCustomer,
            "recipient": recipientPotiron,
            "parcel": parcel
        }
    };
    const colissimoUrl = 'https://api.colissimo.fr/v1/label';
    const colissimoOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${colissimoApiKey}` 
        },
        body: JSON.stringify(data)
    }

    try {
        const response = await fetch(colissimoUrl, colissimoOptions);
        if(!response.ok) {
            console.log('Erreur creating label from colissimo API');
        }
        const responseData = await response.json();
        console.log('suivi', responseData.labelUrl);
        //send by mail
    } catch (error) { 
        console.error('Erreur creatinf label from CBox', error.message);
    }
}

module.exports = {
    createLabel
}
