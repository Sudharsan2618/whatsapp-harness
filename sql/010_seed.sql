-- Base layer: safe defaults every tenant inherits.
insert into platform_defaults (id, config) values (
  true,
  '{
    "persona": { "botName": "Assistant", "languages": ["en"], "tone": "friendly, concise" },
    "guardrails": { "mustRefuse": [], "disclaimers": [], "escalateWhen": ["customer asks for a human"] },
    "tools": [],
    "model": { "provider": "echo", "model": "", "temperature": 0.3 },
    "retrieval": { "topK": 5, "minConfidence": 0.35 },
    "workflows": {}
  }'::jsonb
)
on conflict (id) do update set config = excluded.config, updated_at = now();

insert into tool_registry (key, name, description) values
  ('book_appointment', 'Book appointment', 'Create a booking in the connected calendar'),
  ('send_payment_link', 'Send payment link', 'Generate and send a payment link'),
  ('lookup_customer',   'Lookup customer',   'Fetch the customer record from the CRM'),
  ('handoff_human',     'Hand off to human',  'Escalate the conversation to the owner inbox')
on conflict (key) do nothing;

-- Vertical pack: clinic (doctor).
insert into vertical_packs (key, name, description, config) values (
  'clinic', 'Clinic', 'Appointment-led bot for clinics and doctors',
  '{
    "persona": { "tone": "warm, reassuring, concise" },
    "guardrails": {
      "mustRefuse": ["diagnosis", "medication or dosage advice"],
      "disclaimers": ["This is not medical advice."],
      "escalateWhen": ["symptoms described", "emergency", "anything clinical"]
    },
    "tools": ["book_appointment", "send_payment_link", "handoff_human"]
  }'::jsonb
)
on conflict (key) do update set config = excluded.config, updated_at = now();

-- Vertical pack: law_firm (lawyer).
insert into vertical_packs (key, name, description, config) values (
  'law_firm', 'Law firm', 'Intake and consultation bot for law firms',
  '{
    "persona": { "tone": "formal, precise, careful" },
    "guardrails": {
      "mustRefuse": ["legal advice", "case outcome predictions"],
      "disclaimers": ["This is not legal advice."],
      "escalateWhen": ["facts of a case", "deadlines", "anything advisory"]
    },
    "tools": ["book_appointment", "lookup_customer", "handoff_human"]
  }'::jsonb
)
on conflict (key) do update set config = excluded.config, updated_at = now();
