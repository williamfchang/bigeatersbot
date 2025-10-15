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
}

export const BUY_COMMAND = {
  name: 'buy',
  description: 'Buy a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to buy (max 20)',
      type: 4, // INTEGER
      required: true,
      min_value: 0,
      max_value: 20
    },
  ],
};

export const SELL_COMMAND = {
  name: 'sell',
  description: 'Sell a stock',
  options: [
    {
      name: 'quantity',
      description: 'The number of shares to sell (max 20)',
      type: 4, // INTEGER
      required: true,
      min_value: 0,
      max_value: 20
    },
  ],
};

