import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { prisma } from './prisma';
import { verifyAccessToken, extractBearerToken } from './middleware/auth';
import type { GraphQLContext } from './context';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

async function main() {
  const app = express();
  const httpServer = createServer(app);

  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'opencrisis-backend', timestamp: new Date().toISOString() });
  });

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

  const server = new ApolloServer<GraphQLContext>({
    schema,
    plugins: [
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
    ],
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
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
