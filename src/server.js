/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';

import { GET_PRICE_COMMAND, HELLO_WORLD_COMMAND, LEADERBOARD_COMMAND } from './commands.js';
import * as util from './util.js';

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();


// Homepage!
router.get('/', (request, env) => {
  return new Response(`👋 BigEaterBot checking in! App ID: ${env.DISCORD_APPLICATION_ID}`);
});

// Parameters: password=****&startTime=2025-10-13T23:30:00-07:00&values=[]
router.get('/upload-data', async (request, env) => {
  const d1ModifyPassword = env.D1_MODIFY_PASSWORD;
  const url = new URL(request.url);

  const password = url.searchParams.get('password') || '';
  if (password != d1ModifyPassword) {
    return new JsonResponse({ error: `ur really gonna try this? please do not try to upload fake data lol` }, { status: 401 });
  }

  const symbol = 'WFC-BG'; // TODO: support multiple symbols, currently hardcoded
  const startTime = new Date(url.searchParams.get('startTime')) || '';
  const values = JSON.parse(url.searchParams.get('values')) || [];

  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
});

// Manual data upload, aka harcode the values for upload here. Parameters: password=****
router.get('/manual-upload-data', async (request, env) => {
  const d1ModifyPassword = env.D1_MODIFY_PASSWORD;
  const url = new URL(request.url);

  const password = url.searchParams.get('password') || '';
  if (password != d1ModifyPassword) {
    return new JsonResponse({ error: `this endpoint is for uploading hard coded data cuz i'm lazy` }, { status: 401 });
  }

  // hardcode values here
  const symbol = 'WFC-BG';
  const startTime = new Date('2025-10-09T19:35:22-07:00')
  const values = []
  
  const result = await util.writeStockValuesToDb(env['vitals-stock-market'], symbol, startTime, values);
  return new JsonResponse({ message: result });
})

// Testing grounds (get stock price)
router.get('/testing', async (request, env) => {
    const result = await util.getStockPrice(env['vitals-stock-market'], 'WFC-BG')
    return new JsonResponse({ message: result });
})


/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const db = env['vitals-stock-market'];

    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case HELLO_WORLD_COMMAND.name.toLowerCase(): {
        console.log('HELLO_WORLD_COMMAND received');

        const discordUser = interaction.member.user;
        const sqlId = await util.getUserId(db, discordUser.username);

        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `hello world! <@${discordUser.id}> (${discordUser.username}), your user ID in the SQL database is ${sqlId}`,
          },
        });
      }
      case LEADERBOARD_COMMAND.name.toLowerCase(): {
        console.log('LEADERBOARD_COMMAND received');

        const [cashPortfolios, stocksPortfolios] = await util.getPortfolios(db);
        const content = util.getLeaderboard(cashPortfolios, stocksPortfolios)
        
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: content,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      case GET_PRICE_COMMAND.name.toLowerCase(): {
        console.log('GET_PRICE_COMMAND received');
        
        // TODO: implement all option
        if (interaction.options.length > 0) {
            return new JsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'options not supported yet for this command',
                flags: InteractionResponseFlags.EPHEMERAL,
              },
            });
        }

        // Get stock prices string
        const symbol = 'WFC-BG'; // TODO: support multiple symbols, currently hardcoded
        content = await util.getStockPrice(env['vitals-stock-market'], symbol)
        
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: content,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
    }
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
