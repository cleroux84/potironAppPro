const client = require('./db.js');

//Get data by event id
const getReassortOrder = async (event_id) => {
    const query = `
        SELECT * FROM reassort_order WHERE shopify_event_id = $1
    `
    const result = await client.query(query, [event_id]);

    return result.rows.length;
}

//create webhook received in db
const createReassortOrder = async (event_id, order_id) => {
    const query = `
        INSERT INTO reassort_order (shopify_event_id, order_id)
        VALUES ($1, $2)
        RETURNING id;
    `
    const values = [event_id, order_id];
    try {
        const result = await client.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating reassort order', error);
    }
}

module.exports = {
    getReassortOrder, createReassortOrder
}