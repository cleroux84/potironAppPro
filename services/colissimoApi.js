const fetch = require('node-fetch');
 
const colissimoApiKey = process.env.CBOX_API_KEY;
const colissimoContract = process.env.CBOX_CONTRACT;
const colissimoPassword = process.env.CBOX_PWD;
 
const createLabel = async (senderCustomer, recipientPotiron, parcel) => {
    const data = {
        "contractNumber": colissimoContract,
        "password": colissimoPassword,
        "outputFormat": {
            "x": 0,
            "y": 0,
            "outputPrintingType": "ZPL_10x15_203dpi"
            },
            "letter": {
            "service": {
            "productCode": "COL",
            "depositDate": "2024-25-10",
            "totalAmount": 569,
            "mailBoxPicking": false
            },
            "parcel": {
            "weight": 3,
            "nonMachinable": false
            },
            "sender": {
            "address": {
            "companyName": "cvd",
            "lastName": "dfdf",
            "firstName": "dfdf",
            "line0": "s",
            "email": "sg@toto.Fr",
            "line1": "az",
            "line2": "string",
            "countryCode": "FR",
            "zipCode": "75001",
            "city": "Paris"
            }
            },
            "addressee": {
            "address": {
            "companyName": "the comp",
            "lastName": "you",
            "firstName": "mee",
            "line0": "line0",
            "line1": "line1",
            "line2": "fgfg",
            "countryCode": "FR",
            "city": "Paris",
            "zipCode": "75015"
            }
            }
            },
            "fields": {
            "customField": [
            {
            "key": "string",
            "value": "string"
            }
            ]
            }
           }
            
 
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
            const errorData = await response.json();

            console.log('Erreur creating label from colissimo API', errorData);

        }
        const responseData = await response.json();
        console.log('suivi', responseData);
        return responseData.labelUrl;
    } catch (error) { 
        console.error('Erreur creating label from CBox', error.message);
    }
}
 
module.exports = {
    createLabel
};