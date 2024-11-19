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
                    "line2": "501 Avenue de la couronne",
                    "city": "EPONE",
                    "zipCode": "78680",
                    "countryCode": "FR",
                    "email": "c.leroux@potiron.com",
                    "phoneNumber": "06"
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
        const buffer = await response.arrayBuffer(); 
        const textResponse = new TextDecoder().decode(buffer); 
        // console.log('text response', textResponse);
         if (textResponse.includes('%PDF')) {
            const pdfBase64 = Buffer.from(buffer).toString('base64');
            const parcelNumber = extractParcelNumber(textResponse);
            return {
                pdfData: `data:application/pdf;base64,${pdfBase64}`,
                parcelNumber: parcelNumber,
                origin_ref: senderCustomer.origin_ref
            }
        } else {
            console.log('no pdf colissimo ?')
        }
        return null; 
    } catch (error) {
        console.error('Erreur lors de la création de l\'étiquette depuis CBox', error);
    }
};

const extractParcelNumber = (textResponse) => {
    const regex = /"parcelNumber":"(\w+)"/; 
    const match = textResponse.match(regex);
    return match ? match[1]: null;
}
 
module.exports = {
    createLabel
};