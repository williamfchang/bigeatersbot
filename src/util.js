import * as c from './constants.js';

// get SQL user id from discord username
export async function getUserId(db, username) {
    const { results } = await db.prepare("SELECT * FROM users WHERE discord_username = ?")
        .bind(username).run();
    return results[0]?.user_id || -1;
}

// Write to db
export async function writeStockValuesToDb(db, symbol, startTime, values) {
    // Error checking
    if (startTime == '') {
        return 'ERROR: startTime is empty';
    }
    if (values.length == 0) {
        return 'ERROR: values is empty';
    }

    // Get latest timestamp in db
    const { results: latestTimestampResults } = await db.prepare("SELECT MAX(timestamp) FROM stock_price WHERE symbol = ?")
        .bind(symbol)
        .run();
    const latestTimestamp = latestTimestampResults[0]['MAX(timestamp)'] || -1; // if no data, default to -1 so all entries are added

    // Create list of entries
    let currTime = new Date(startTime);
    currTime.setMinutes(currTime.getMinutes() - c.DATA_UPLOAD_INTERVAL_MINUTES); // offset start time since we begin loop with increment
    const entries = [];
    for (const value of values) {
        // Increment time by interval
        currTime.setMinutes(currTime.getMinutes() + c.DATA_UPLOAD_INTERVAL_MINUTES);

        // Check current time against latest data point in db. Aka if data point is already in db, skip it
        // TODO: optimize this so we calculate the starting point in values
        if (currTime.getTime() <= latestTimestamp) {
            continue;
        }

        // add entry if time is newer (aka not in database)
        entries.push([symbol, currTime.getTime(), value]);
    }

    // Check if there are any entries
    if (entries.length == 0) {
        return 'No new entries, returning';
    }

    // Construct SQL statement
    let sql = 'INSERT INTO stock_price (symbol, timestamp, value) VALUES ';
    sql += entries.map(entry => `("${entry[0]}", ${entry[1]}, ${entry[2]})`).join(', ');

    await db.prepare(sql).run();
    return sql;
}

// Return cash results and stocks results
export async function getPortfolios(db) {
    const { results: cashResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol = 'CASH' ORDER BY amount DESC LIMIT ${c.MAX_LEADERBOARD_ENTRIES}`)
        .run();
    const { results: stocksResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol != 'CASH' ORDER BY amount DESC LIMIT ${c.MAX_LEADERBOARD_ENTRIES*constants.NUM_SYMBOLS}`)
        .run();
    
    return [cashResults, stocksResults];
}