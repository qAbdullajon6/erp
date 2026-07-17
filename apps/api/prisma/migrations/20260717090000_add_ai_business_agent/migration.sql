-- AI Business Agent: read-only mode + approval status

-- Add readOnly flag to conversations
ALTER TABLE "ai_conversations" ADD COLUMN "readOnly" BOOLEAN NOT NULL DEFAULT false;

-- Add AWAITING_CONFIRMATION to the tool call status enum
ALTER TYPE "AiToolCallStatus" ADD VALUE 'AWAITING_CONFIRMATION';
