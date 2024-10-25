const fetch = require('node-fetch');
 
const colissimoApiKey = process.env.CBOX_API_KEY;
const colissimoContract = process.env.CBOX_CONTRACT;
const colissimoPassword = process.env.CBOX_PWD;
 
const createLabel = async (senderCustomer, recipientPotiron, parcel) => {
    const data = `{
        "contractNumber": colissimoContract,
        "password": colissimoPassword,
        "outputFormat": {
            "x": 0,
            "y": 0,
            "outputPrintingType": "PDF_10x15_300dpi",
            "dematerialized": false,
            "returnType": "BPR",
            "printCODDocument": true
        },
        "letter": {
            "service": {
            "productCode": "DOM",
            "depositDate": new Date().toISOString(),
            "mailBoxPicking": false
            },
            "parcel": {
                "weight": 4
            },
            "sender": {
                "address": {
                    "companyName": "Expéditeur",
                    "lastName": "Durand",
                    "firstName": "Pierre",
                    "line2": "1 rue de la Poste",
                    "city": "Paris",
                    "zipCode": "75001",
                    "countryCode": "FR"
                }
            },
            "addressee": {
                "address": {
                    "companyName": "Potiron",
                    "lastName": "Leroux",
                    "firstName": "Céline",
                    "line2": "10 avenue des Champs Élysées",
                    "city": "Paris",
                    "zipCode": "75008",
                    "countryCode": "FR"
                }
            }
        }
    }
 `
    // Vérifier le JSON avant de l'envoyer
    console.log(JSON.stringify(data, null, 2)); // Ajout d'une indentation pour plus de lisibilité
 
    const colissimoUrl = 'https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/2.0/generateLabel';
    const colissimoOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length.toString(),
            'apiKey': colissimoApiKey
        },
        body: data
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
        console.error('Erreur creating label from CBox', error);
    }
}
 
module.exports = {
    createLabel
};