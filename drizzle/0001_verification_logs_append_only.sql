CREATE FUNCTION forbid_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_logs is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER verification_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_log_mutation();
