import type {
  aggregateBarSchema,
  aggregateInputSchema,
  assetClassSchema,
  conversationSchema,
  createConversationSchema,
  createFolderSchema,
  createWorkspaceSchema,
  currencySchema,
  financialFilterSchema,
  financialSummarySchema,
  folderSchema,
  messageRoleSchema,
  messageSchema,
  realtimeQuoteSchema,
  realtimeTradeSchema,
  sendMessageSchema,
  subscribeInputSchema,
  tickerDetailSchema,
  tickerSearchInputSchema,
  tickerSnapshotSchema,
  timespanSchema,
  transactionSchema,
  transactionTypeSchema,
  updateFolderSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
  userProfileSchema,
  workspaceSchema,
  wsClientMessageSchema,
  wsServerMessageSchema,
} from '@a4/shared-schemas';
import type { z } from 'zod';

// Workspace types
export type Workspace = z.infer<typeof workspaceSchema>;
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;

// Folder types
export type Folder = z.infer<typeof folderSchema>;
export type CreateFolder = z.infer<typeof createFolderSchema>;
export type UpdateFolder = z.infer<typeof updateFolderSchema>;

// Chat types
export type Message = z.infer<typeof messageSchema>;
export type MessageRole = z.infer<typeof messageRoleSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type CreateConversation = z.infer<typeof createConversationSchema>;
export type SendMessage = z.infer<typeof sendMessageSchema>;

// Financial types
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type FinancialSummary = z.infer<typeof financialSummarySchema>;
export type FinancialFilter = z.infer<typeof financialFilterSchema>;

// User types
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

// Market data types
export type AssetClass = z.infer<typeof assetClassSchema>;
export type Timespan = z.infer<typeof timespanSchema>;
export type TickerDetail = z.infer<typeof tickerDetailSchema>;
export type AggregateBar = z.infer<typeof aggregateBarSchema>;
export type RealtimeQuote = z.infer<typeof realtimeQuoteSchema>;
export type RealtimeTrade = z.infer<typeof realtimeTradeSchema>;
export type TickerSnapshot = z.infer<typeof tickerSnapshotSchema>;
export type TickerSearchInput = z.infer<typeof tickerSearchInputSchema>;
export type AggregateInput = z.infer<typeof aggregateInputSchema>;
export type SubscribeInput = z.infer<typeof subscribeInputSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
