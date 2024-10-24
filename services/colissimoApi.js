const fetch = require('node-fetch');

const colissimoApiKey = process.env.CBOX_API_KEY;
const colissimoContract = process.env.CBOX_CONTRACT;
const colissimoPassword = process.env.CBOX_PWD;

const createLabel = async (senderCustomer, recipientPotiron, parcel) => {
    const data = {
        "contractNumber": colissimoContract,
        "password": colissimoPassword,
        "outputFormat": {
            "outputPrintingType": "PDF"
        },
        "letter": {
            "sender": senderCustomer,
            "addressee": recipientPotiron,
            "parcel": {
                "weight": parcel.weight,
                "insuranceValue": 0
            }
        }
    };
    const colissimoUrl = 'https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/2.0/generateLabel';
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
        console.error('Erreur creating label from CBox', error.message);
    }
}

module.exports = {
    createLabel
}
