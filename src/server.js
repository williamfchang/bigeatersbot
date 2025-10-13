/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { HELLO_WORLD_COMMAND, LEADERBOARD_COMMAND } from './commands.js';
import { InteractionResponseFlags } from 'discord-interactions';

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

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (request, env) => {
  return new Response(`👋 BigEaterBot checking in! App ID: ${env.DISCORD_APPLICATION_ID}`);
});

// Test D1 database
router.get('/d1-test', async (request, env) => {
  const db = env['vitals-stock-market'];
  const { results } = await db.prepare("SELECT * FROM users WHERE discordUsername = ?")
    .bind("william.c7879").run();
  return results;
});

// 1) Query parameter: /hello?name=william
router.get('/hello', (request, env) => {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'world';
  const arr = JSON.parse(url.searchParams.get('data')) || [];
  return new JsonResponse({ message: `Hello, ${name}! Length of data is ${arr.length}` });
});

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
    const db = env['vitals-stock-market']

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

        // let content = "test output";

        const [cashPortfolios, stocksPortfolios] = await util.getPortfolios(db);

        // Create leaderboard in order of most cash
        let leaderboard = new Map();
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
        let content = "Leaderboard:\n";
        for (const [key, value] of leaderboard) {
            content += `1. <@${key}>: ${JSON.stringify(value)}\n`;
        }
        
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
