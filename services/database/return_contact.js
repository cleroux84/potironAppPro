const client = require ('./db.js');

//Save data in db and return id
const saveReturnContactData = async (warehouseId, shopifyId, itemsToReturn) => {
    const query = `
        INSERT INTO return_contact (warehouse_id, shopify_id, items_to_return)
        VALUES ($1, $2, $3)
        RETURNING id;
    `
    const values = [warehouseId, shopifyId, itemsToReturn];
    try {
        const result = await client.query(query, values);
        console.log("result", result);
        // const returnDbId = result.rows[0].id;
        // console.log('Data for returnContact saved in DB', returnDbId);
        // return returnDbId;
        // recupérer et return id in db
    } catch (error) {
        console.error('Error saving return data in return_contact table');
    } finally {
        await client.end();
    }
}

module.exports = {
    saveReturnContactData
}