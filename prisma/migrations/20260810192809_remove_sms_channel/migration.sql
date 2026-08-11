-- Drop SMS-only fields and enum value; SMS is not being integrated (kept Email).
-- (Contact.smsOptedOut / MessageTemplate.dltTemplateId already dropped in an
-- earlier partial run of this migration file — guarded with IF EXISTS.)
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "smsOptedOut";
ALTER TABLE "MessageTemplate" DROP COLUMN IF EXISTS "dltTemplateId";

-- Postgres enums can't drop a value directly; recreate the enum without SMS.
-- Both MessageTemplate.channel and Message.channel use this enum.
ALTER TYPE "Channel" RENAME TO "Channel_old";
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'EMAIL');
ALTER TABLE "MessageTemplate" ALTER COLUMN "channel" TYPE "Channel" USING ("channel"::text::"Channel");
ALTER TABLE "Message" ALTER COLUMN "channel" TYPE "Channel" USING ("channel"::text::"Channel");
DROP TYPE "Channel_old";
