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
                "productCode": "DOM", // Exemple: code produit pour un envoi domestique
                "depositDate": new Date().toISOString(), // Date actuelle pour l'envoi
                "commercialName": "POTIRON TEST" // Nom commercial de l'expéditeur
            },
            "parcel": {
                "weight": parcel.weight,
                "insuranceValue": 0,
                "recommendationLevel": "R1", // Niveau de recommandation (R1, R2, etc.)
                "nonMachinable": false // Si le colis est non-mécanisable
            },
            "sender": {
                "address": {
                    "companyName": "client qui retourne",
                    "lastName": "client qui retourne",
                    "firstName": "client qui retourne",
                    "line1": senderCustomer.address,
                    "city": senderCustomer.city,
                    "zipCode": senderCustomer.postalCode,
                    "countryCode": senderCustomer.country,
                    "email": "client qui retourne",
                    "phoneNumber": "client qui retourne"
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
                    "email": "c.leroux@Potiron.com",
                    "phoneNumber": "recipientPotiron.phoneNumber"
                }
            }
        }
    };
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
        //send by mail
    } catch (error) { 
        console.error('Erreur creating label from CBox', error.message);
    }
}

module.exports = {
    createLabel
}
