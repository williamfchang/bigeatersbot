/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

export const HELLO_WORLD_COMMAND = {
  name: 'helloworld',
  description: 'Test command to respond with hello',
};

export const LEADERBOARD_COMMAND = {
  name: 'leaderboard',
  description: 'Show all users and their points',
}

export const GET_PRICE_COMMAND = {
  name: 'getprice',
  description: 'Get the past 24 hours of the stock (or all history)',
  options: [
    {
      name: 'all',
      description: 'If you want all history',
      type: 3, // STRING
      required: false,
    },
  ],
}

export const BUY_COMMAND = {
  name: 'buy',
  description: 'Buy a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to buy',
      type: 4, // INTEGER
      required: true,
    },
  ],
};

export const SELL_COMMAND = {
  name: 'sell',
  description: 'Sell a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to sell',
      type: 4, // INTEGER
      required: true,
    },
  ],
};

