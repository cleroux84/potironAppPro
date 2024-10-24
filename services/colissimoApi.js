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
            "service": {
                "productCode": "DOM", 
                "depositDate": new Date().toISOString(),
                "commercialName": "POTIRON TEST"
            },
            "parcel": {
                "weight": parcel.weight,
                "insuranceValue": 0,
                "recommendationLevel": "R1",
                "nonMachinable": false
            },
            "sender": {
                "address": {
                    "companyName": "Client Retour",
                    "lastName": "Retour",
                    "firstName": "Client",
                    "line1": senderCustomer.address,
                    "city": senderCustomer.city,
                    "zipCode": senderCustomer.postalCode,
                    "countryCode": senderCustomer.country,
                    "email": "client@exemple.com",
                    "phoneNumber": "0600000000"
                }
            },
            "addressee": {
                "address": {
                    "companyName": "Potiron",
                    "lastName": "Céline",
                    "firstName": "Céline",
                    "line1": recipientPotiron.address,
                    "city": recipientPotiron.city,
                    "zipCode": recipientPotiron.postalCode,
                    "countryCode": recipientPotiron.country,
                    "email": "c.leroux@potiron.com",
                    "phoneNumber": "0612345678"
                }
            }
        }
    };
 
    // Vérifier le JSON avant de l'envoyer
    console.log(JSON.stringify(data, null, 2)); // Ajout d'une indentation pour plus de lisibilité
 
    const colissimoUrl = 'https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/2.0/generateLabel';
    const colissimoOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apiKey': colissimoApiKey
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
    } catch (error) { 
        console.error('Erreur creating label from CBox', error.message);
    }
}
 
module.exports = {
    createLabel
};