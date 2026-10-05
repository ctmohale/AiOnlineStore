ALTER TABLE email_outbox
  ADD COLUMN reply_to_email VARCHAR(190) NULL AFTER recipient_name;
