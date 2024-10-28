const fetch = require('node-fetch');
 
const colissimoApiKey = process.env.CBOX_API_KEY;
const colissimoContract = process.env.CBOX_CONTRACT;
const colissimoPassword = process.env.CBOX_PWD;
 
const createLabel = async (senderCustomer, parcel) => {
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
                "weight": parcel.weight
            },
            "sender": {
                "address": {
                    "companyName": senderCustomer.name,
                    // "lastName": "Durand",
                    // "firstName": "Pierre",
                    "line2": senderCustomer.address,
                    "line3": senderCustomer.address2,
                    "city": senderCustomer.city,
                    "zipCode": senderCustomer.postalCode,
                    "countryCode": senderCustomer.country,
                    "email": senderCustomer.email,
                    "phoneNumber": senderCustomer.phone
                }
            },
            "addressee": {
                "address": {
                    "companyName": "GMA Potiron PARIS",
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
        const buffer = await response.arrayBuffer(); // Récupère la réponse sous forme de tableau de bits
        const textResponse = new TextDecoder().decode(buffer); // Décodage de la réponse pour analyse
        // console.log('text response', textResponse);
 
        // Vérifie si c'est un flux PDF
        if (textResponse.includes('%PDF')) {
            // Conversion en base64
            const pdfBase64 = Buffer.from(buffer).toString('base64');
            console.log('par ici');
            return `data:application/pdf;base64,${pdfBase64}`; // Retourne un lien de type data URI
        }
 
        // Parse la réponse JSON si ce n'est pas un flux PDF
        const parts = textResponse.split('--uuid:');
        let jsonResponse = null;
        for (const part of parts) {
            if (part.includes('application/json')) {
                const jsonPart = part.substring(part.indexOf('{'), part.lastIndexOf('}') + 1);
                try {
                    jsonResponse = JSON.parse(jsonPart);
                    if (jsonResponse.labelV2Response && jsonResponse.labelV2Response.pdfUrl) {
                        console.log('ppl');
                        return jsonResponse.labelV2Response.pdfUrl;
                    }
                } catch (parseError) {
                    console.error('Erreur lors du parsing JSON:', parseError.message);
                }
                break;
            }
        }
 
        return null; // Si rien n'est trouvé
    } catch (error) {
        console.error('Erreur lors de la création de l\'étiquette depuis CBox', error);
    }
};
 
module.exports = {
    createLabel
};