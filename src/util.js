import * as c from './constants.js';

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
    const { results: stocksResults } = await db.prepare(`SELECT * FROM portfolios WHERE symbol != 'CASH' ORDER BY amount DESC LIMIT ${c.MAX_LEADERBOARD_ENTRIES*c.NUM_SYMBOLS}`)
        .run();
    
    return [cashResults, stocksResults];
}

// With portfolio info, create leaderboard output
export function getLeaderboard(cashPortfolios, stocksPortfolios) {
    // Create leaderboard in order of most cash
    const leaderboard = new Map();
    for (const [index, row] of cashPortfolios.entries()) {
        leaderboard.set(row.user_id, {'HP': row.amount});
    } 

    // Add other stocks to the leaderboard
    for (const [index, row] of stocksPortfolios.entries()) {
        let user_portfolio = leaderboard.get(row.user_id);
        user_portfolio[row.symbol] = row.amount;
        leaderboard.set(row.user_id, user_portfolio);
    }

    // Create leaderboard output string
    let output = "Leaderboard:\n";
    for (const [key, value] of leaderboard) {
        output += `1. <@${key}>: ${JSON.stringify(value)}\n`;
    }

    return output;
}

// Get text output of stock price history
// TODO: currently hardcoded to 24 hours, and display in PDT (subtract 7)
export async function getStockPrice(db, symbol) {
    // Get curr time and time 24 hours ago (starting at top of the hour)
    const currDate = new Date();
    const dateOneDayAgo = new Date(currDate);
    dateOneDayAgo.setHours(dateOneDayAgo.getHours() - 24);
    dateOneDayAgo.setMinutes(0);

    // Get values from db
    const { results } = await db.prepare("SELECT timestamp, value FROM stock_price WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?")
        .bind(symbol, dateOneDayAgo.getTime(), currDate.getTime())
        .run();

    // Construct output
    let output = `Stock price of ${symbol} since 24 hours ago (in PDT, data may be lagging):\n`
    const dataPointsPerHour = Math.floor(60/c.DATA_UPLOAD_INTERVAL_MINUTES)

    for (let i = 0; i < results.length; i += dataPointsPerHour) {
        const firstTimestamp = new Date(results[i].timestamp);
       
        // get hour
        let currHour = (24 + firstTimestamp.getHours() - c.TIMEZONE_OFFSET) % 24;
        currHour = String(currHour).padStart(2, '0')

        // get values for this hour
        let arrForCurrHour = results.slice(i, i+dataPointsPerHour).map(entry => String(entry.value));
        arrForCurrHour = arrForCurrHour.map(s => s.padStart(3, '0'))

        // put it all together
        const strForCurrHour = `Hour ${currHour}: ${arrForCurrHour.join(' ')}\n`
        output += strForCurrHour
    }

    return '```\n' + output + '\n```';
}