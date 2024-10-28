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
            "returnType": "SendPDFLinkByMail",
            "outputPrintingType": "PDF_10x15_300dpi",
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
                    "countryCode": "FR",
                    "email": "c.leroux@potiron.com"
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
                    "countryCode": "FR",
                    "email": "c.leroux@potiron.com"
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
    };
 
    try {
        const response = await fetch(colissimoUrl, colissimoOptions);
        const textResponse = await response.text();
        // console.log('text response', textResponse);
 
        // Diviser la réponse en sections
        const parts = textResponse.split('--uuid:');
 
        let jsonResponse = null;
 
        // Recherche de la partie JSON
        for (const part of parts) {
            if (part.includes('application/json')) {
                const jsonPart = part.substring(part.indexOf('{'), part.lastIndexOf('}') + 1);
                try {
                    jsonResponse = JSON.parse(jsonPart);
                    return jsonResponse;
                } catch (parseError) {
                    console.error('Erreur lors du parsing JSON:', parseError.message);
                }
                break;
            }
        }
 
        if (jsonResponse && jsonResponse.labelV2Response && jsonResponse.labelV2Response.pdfUrl) {
            console.log('URL du PDF:', jsonResponse.labelV2Response.pdfUrl);
            return jsonResponse.labelV2Response.pdfUrl;
        } else {
            console.log("Pas d'URL PDF trouvée dans la réponse JSON");
            return null;
        }
    } catch (error) {
        console.error('Erreur creating label from CBox', error);
    }
};
 
module.exports = {
    createLabel
};