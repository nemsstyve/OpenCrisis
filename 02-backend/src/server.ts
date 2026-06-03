import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDisableSchemaIntrospection } from '@apollo/server/plugin/disabled';
import { expressMiddleware } from '@apollo/server/express4';
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
import type { GraphQLContext } from './context';

const IS_PROD = process.env.NODE_ENV === 'production';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

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

  // D4 — désactiver l'introspection en production
  if (IS_PROD) {
    apolloPlugins.push(ApolloServerPluginDisableSchemaIntrospection() as never);
  }

  const server = new ApolloServer<GraphQLContext>({
    schema,
    // D4 — limiter la profondeur des requêtes GraphQL
    validationRules: [depthLimit(10)],
    plugins: apolloPlugins,
  });

  await server.start();

  app.use(
    '/api/graphql',
    expressMiddleware(server, {
      context: async ({ req, res }) => {
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

  // Cleanup on shutdown
  const shutdown = async () => {
    await server.stop();
    await prisma.$disconnect();
    await pubsub.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
