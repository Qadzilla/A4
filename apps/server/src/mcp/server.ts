import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { and, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { type DB, db as sharedDb } from '../db';
import { workspaces } from '../db/schema';
import { getToolDefinitions, safeExecuteTool } from '../services/ai-tools';
import { verifyAccessToken } from '../services/personal-access-tokens';

/**
 * Exposes the AI tool registry to external MCP clients (Claude Desktop, other
 * agents) over Streamable HTTP. Auth is a personal access token; every tool
 * call is scoped to a workspace the token's owner actually owns.
 */

/** Destructive tools stay out of the external surface in v1. */
const EXCLUDED_TOOLS = new Set(['delete_canvas_item']);

/** Tools that operate across workspaces and take no workspaceId. */
const WORKSPACE_OPTIONAL_TOOLS = new Set(['list_workspaces']);

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * The in-app registry gets its workspace from the chat session; MCP has no
 * ambient workspace, so workspaceId becomes an explicit required parameter on
 * every workspace-scoped tool.
 */
export function buildMcpToolDefinitions(): McpToolDefinition[] {
  return getToolDefinitions()
    .filter((def) => !EXCLUDED_TOOLS.has(def.name))
    .map((def) => {
      const schema = def.input_schema as {
        type: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const workspaceOptional = WORKSPACE_OPTIONAL_TOOLS.has(def.name);
      return {
        name: def.name,
        description: def.description ?? '',
        inputSchema: workspaceOptional
          ? { ...schema }
          : {
              ...schema,
              properties: {
                ...schema.properties,
                workspaceId: {
                  type: 'string',
                  description:
                    'The workspace to operate on. Call list_workspaces first to discover ids.',
                },
              },
              required: [...(schema.required ?? []), 'workspaceId'],
            },
      };
    });
}

export interface McpCallResult {
  result: Record<string, unknown>;
  isError: boolean;
}

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  db: DB,
): Promise<McpCallResult> {
  if (EXCLUDED_TOOLS.has(name)) {
    return { result: { error: `Tool "${name}" is not available over MCP` }, isError: true };
  }

  let workspaceId = '';
  if (!WORKSPACE_OPTIONAL_TOOLS.has(name)) {
    const candidate = args.workspaceId;
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return {
        result: { error: 'workspaceId is required. Call list_workspaces to discover ids.' },
        isError: true,
      };
    }
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, candidate), eq(workspaces.userId, userId)));
    if (!workspace) {
      return { result: { error: 'Workspace not found' }, isError: true };
    }
    workspaceId = candidate;
  }

  const { workspaceId: _stripped, ...toolInput } = args;
  return safeExecuteTool(name, toolInput, { db, userId, workspaceId });
}

function buildServerForUser(userId: string, db: DB): Server {
  const server = new Server(
    { name: 'a4-finance', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildMcpToolDefinitions(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { result, isError } = await executeMcpTool(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, unknown>,
      userId,
      db,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError,
    };
  });

  return server;
}

/**
 * Stateless Streamable HTTP: each POST builds a fresh server+transport bound
 * to the authenticated user. No sessions to leak, no cross-user state.
 */
export async function handleMcpRequest(req: Request, res: Response, db: DB = sharedDb) {
  const authHeader = req.headers.authorization ?? '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  const userId = rawToken ? await verifyAccessToken(rawToken, db) : null;
  if (!userId) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid or missing access token' },
      id: null,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed — stateless transport, POST only' },
      id: null,
    });
    return;
  }

  const server = buildServerForUser(userId, db);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
