/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

export const HELLO_WORLD_COMMAND = {
  name: 'hello-world',
  description: 'Test command to respond with hello',
};

export const LEADERBOARD_COMMAND = {
  name: 'leaderboard',
  description: 'Show all users and their points',
}

export const GET_PRICE_COMMAND = {
  name: 'get-price',
  description: 'Get the past 24 hours of the stock (or all history)',
}

export const BUY_COMMAND = {
  name: 'buy',
  description: 'Buy a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to buy (no max!!!)',
      type: 4, // INTEGER
      required: true,
      min_value: 0
    },
  ],
};

export const SELL_COMMAND = {
  name: 'sell',
  description: 'Sell a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to sell (no max!!!)',
      type: 4, // INTEGER
      required: true,
      min_value: 0
    },
  ],
};

export const GET_OPEN_ORDERS_COMMAND = {
  name: 'get-open-orders',
  description: 'Get your open orders',
};

export const EXECUTE_ORDERS_COMMAND = {
  name: 'execute-orders',
  description: 'Execute all open orders in the market',
}