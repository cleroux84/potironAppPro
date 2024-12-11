//Mail for Team Potiron

const fs = require('fs');
require('dotenv').config();
const {Client} = require('@microsoft/microsoft-graph-client');
require ('isomorphic-fetch');

const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;
const MAILDEV = process.env.MAILDEV;

const signatureAttachement =  {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: 'signature.png',
    contentId: 'signature', 
    isInline: true,
    contentType: 'image/png',
    contentBytes: fs.readFileSync('assets/signature.png').toString('base64')
  } 

//Initialize data for ms365
const initiMicrosoftGraphClient = (accessTokenMS365) => {
    return Client.init({
      authProvider: (done) => {
          done(null, accessTokenMS365); 
      }
    });
  }

  //Send email with kbis to Potiron Team (Magalie) from bonjour@potiron.com to check and validate company
async function sendEmailWithKbis(accessTokenMS365, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone, isUpgrade) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();
    let mailObjectkBis = `Nouveau Kbis pour ${companyName} à vérifier et valider`;
    if(isUpgrade) {
      mailObjectkBis = `Demande Upgrade Compte professionnel pour ${companyName}`;
    }
    const message = {
        subject: mailObjectkBis,
        body: {
            contentType: 'HTML',
            content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameNoStar}</strong>.</p>
          <p style="margin: 0;">Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
          <p style="margin: 0;">Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
          <p style="margin: 0;">Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
          <p>Bonne journée !</p>
          <img src='cid:signature'/>
            `
        },
        toRecipients: [
            {
                emailAddress: {
                    address: MAILRECIPIENT
                }
            }
        ],
        bccRecipients: [
          {
              emailAddress: {
                  address: MAILDEV
              }
          }
        ],
        attachments: [
            {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: `kbis_${companyName}.pdf`,
                contentBytes: fs.readFileSync(filePath).toString('base64') 
            },
            signatureAttachement
          ]
      };
    try {
        await client.api('/me/sendMail').post({ message });
        console.log('Email KBIS envoyé avec succès');
    } catch (error) {
      if(error.response) {
        console.log('erreur API', error.response.data);
      } else {
        console.log('Erreur lors de l\'envoi de l\'email : ', error);
        }
    }
  }

  //Send mail to Potiron Team to ask delivery quote
  async function sendNewDraftOrderMail(accessTokenMS365, firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPrefValue, paletteEquipmentValue, appointmentValue, paletteNotes) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let deliveryTextIfPalette = '';
    if(deliveryPrefValue.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipmentValue}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${appointmentValue}</p>
      <p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>
      `
    }
    let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();

    const message = {
      subject: 'Nouvelle demande de cotation pour Commande Provisoire ' + draftOrderId, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameNoStar}</p>
          <p style="margin: 0;">Si besoin, il est joignable à ${customerMail} et au ${customerPhone} </p>
          <p style="margin: 0;">L'adresse de livraison renseignée est : ${shippingAddress}</p>
          <p>Préférence(s) de livraison : ${deliveryPrefValue}</p>
          ${deliveryTextIfPalette}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: MAILCOTATION
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email for cotation sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }

  //Send email to Magalie with parcelNumber when automated return with ASSET(Avoir / discount code)
  async function sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let trackingLinks = '';
    for (const number of parcelNumbers) {
      const packageTrack = `https://www.laposte.fr/outils/suivre-vos-envois?code=${number}`
      trackingLinks += `<p>Numéro de colis : ${number} - <a href="${packageTrack}">Suivi du colis</a></p>`; 
    }
    
    const message = {
      subject: 'Nouvelle demande de retour automatisé avec code de réduction', 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle demande de retour a été créée pour le client : ${senderCustomer.name}</p>
          <p style="margin: 0;">Une commande retour a été créée dans Shippingbo GMA : ${returnOrderId}</p>
          <p style="margin: 0;">La commande d'origine Shopify est : ${senderCustomer.origin_ref}.</p>
          <p>A réception de son colis, un code de réduction/remboursement lui sera automatiquement envoyé par mail, d'une valeur de ${totalOrder}€.</p>
          ${trackingLinks}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email SAv after automated return sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }

  //Send email to Magalie with parcelNumber when automated return with REFUND(Remboursement)
  async function sendRefundDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let trackingLinks = '';
    for (const number of parcelNumbers) {
      const packageTrack = `https://www.laposte.fr/outils/suivre-vos-envois?code=${number}`
      trackingLinks += `<p>Numéro de colis : ${number} - <a href="${packageTrack}">Suivi du colis</a></p>`; 
    }
    
    const message = {
      subject: 'Nouvelle demande de retour automatisé avec remboursement', 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle demande de retour a été créée pour le client : ${senderCustomer.name}</p>
          <p style="margin: 0;">Une commande retour a été créée dans Shippingbo GMA : ${returnOrderId}</p>
          <p style="margin: 0;">La commande d'origine Shopify est : ${senderCustomer.origin_ref}.</p>
          <p>A réception de son colis, vous recevrez un nouvel email pour effectuer un remboursement sur son compte d'une valeur de ${totalOrder}€.</p>
          ${trackingLinks}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email SAv after automated return sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }

  async function mailToSendRefund(accessTokenMS365, customerData, orderCanceledId, shopifyName, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let nameNoStar = customerData.last_name.replace(/⭐/g, '').trim();
    let totalOrderFixed = totalOrder.toFixed(2);
    const message = {
      subject: 'Remboursement à effectuer suite réception Commande Retour', 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">La commande retour ${orderCanceledId} concernant la commande Shopify ${shopifyName} de ${customerData.first_name} ${nameNoStar}, a été réceptionnée</p>
          <p>Merci d'effectuer un remboursement sur son compte d'une valeur de ${totalOrderFixed}€.</p>
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email SAv after automated return sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }

  module.exports = {
    sendEmailWithKbis,
    sendNewDraftOrderMail,
    sendReturnDataToSAV,
    signatureAttachement,
    initiMicrosoftGraphClient,
    sendRefundDataToSAV,
    mailToSendRefund
  }