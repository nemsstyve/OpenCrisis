import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import depthLimit from 'graphql-depth-limit';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { prisma } from './prisma';
import { pubsub } from './pubsub';
import { verifyAccessToken, extractBearerToken } from './middleware/auth';
import filesRouter from './routes/files';
import exportRouter from './routes/export';
import { loadEnv } from './utils/env';
import type { GraphQLContext } from './context';

const env = loadEnv();
const IS_PROD = env.NODE_ENV === 'production';
const PORT = env.PORT;
const CORS_ORIGIN = env.CORS_ORIGIN;

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // D5 — helmet (sécurité headers) + body size limit 1 MB
  app.use(helmet({ contentSecurityPolicy: IS_PROD }));
  app.set('trust proxy', 1); // D3 — IP réelle derrière nginx
  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'opencrisis-backend', timestamp: new Date().toISOString() });
  });

  app.use('/files', filesRouter);
  app.use('/export', exportRouter);

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // WebSocket server for GraphQL subscriptions
  const wsServer = new WebSocketServer({ server: httpServer, path: '/api/graphql' });

  const wsCleanup = useServer(
    {
      schema,
      context: async (wsCtx) => {
        const authHeader = wsCtx.connectionParams?.Authorization as string | undefined;
        const token = authHeader ? extractBearerToken(authHeader) : null;
        const payload = token ? verifyAccessToken(token) : null;
        return { userId: payload?.userId ?? null, req: null, res: null } satisfies GraphQLContext;
      },
    },
    wsServer,
  );

  const apolloPlugins = [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsCleanup.dispose();
          },
        };
      },
    },
  ];

  const server = new ApolloServer<GraphQLContext>({
    schema,
    // D4 — introspection désactivée en prod + profondeur limitée
    introspection: !IS_PROD,
    validationRules: [depthLimit(10)],
    // N4 — ne pas divulguer les détails d'erreurs internes (Prisma, etc.) en production.
    // Les GraphQLError métier portent un code explicite et restent transmises.
    formatError: (formattedError) => {
      const code = formattedError.extensions?.code;
      if (IS_PROD && (code === undefined || code === 'INTERNAL_SERVER_ERROR')) {
        return { message: 'Une erreur interne est survenue', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
      }
      return formattedError;
    },
    plugins: apolloPlugins,
  });

  await server.start();

  app.use(
    '/api/graphql',
    expressMiddleware(server, {
      context: async ({ req, res }: { req: express.Request; res: express.Response }) => {
        const token = extractBearerToken(req.headers.authorization);
        const payload = token ? verifyAccessToken(token) : null;
        return { userId: payload?.userId ?? null, req, res } satisfies GraphQLContext;
      },
    }),
  );

  httpServer.listen(PORT, () => {
    console.log(`[backend] HTTP  → http://localhost:${PORT}/api/graphql`);
    console.log(`[backend] WS    → ws://localhost:${PORT}/api/graphql`);
    console.log(`[backend] Health → http://localhost:${PORT}/health`);
  });

  // N8 — purge périodique des refresh tokens expirés (au démarrage puis toutes les heures)
  const purgeExpiredTokens = () => {
    prisma.refreshToken
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch((err) => console.error('[cleanup] purge des refresh tokens échouée:', err));
  };
  purgeExpiredTokens();
  const purgeTimer = setInterval(purgeExpiredTokens, 60 * 60 * 1000);
  purgeTimer.unref();

  // Cleanup on shutdown
  const shutdown = async () => {
    clearInterval(purgeTimer);
    await server.stop();
    await prisma.$disconnect();
    await pubsub.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
