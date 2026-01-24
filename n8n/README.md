# PharmaOpsFlow n8n Workflows

This directory contains n8n workflow definitions for automating PharmaOpsFlow processes.

## Invoice Extraction Workflow

**File:** `invoice-extraction-workflow.json`

This workflow automates invoice data extraction using AI.

### Setup Instructions

1. **Import the Workflow**
   - Open n8n
   - Go to Workflows > Import from File
   - Select `invoice-extraction-workflow.json`

2. **Configure Environment Variables**
   Set these environment variables in n8n:
   - `API_BASE_URL`: Your PharmaOpsFlow API URL (e.g., `http://localhost:4000`)
   - `NOTIFICATION_WEBHOOK_URL`: (Optional) URL to receive notifications when extractions need review

3. **Create API Credentials**
   - In n8n, go to Credentials
   - Create a new "Header Auth" credential named `PharmaOpsFlow API Auth`
   - Set the header name to `Authorization`
   - Set the header value to `Bearer <your-jwt-token>`

4. **Activate the Workflow**
   - After configuration, activate the workflow

### Triggering the Workflow

The workflow can be triggered via webhook POST request:

```bash
curl -X POST "https://your-n8n-instance/webhook/invoice-extraction" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "invoice-uuid-here",
    "fileId": "optional-file-uuid"
  }'
```

### Workflow Steps

1. **Webhook Trigger** - Receives extraction requests
2. **Validate Input** - Ensures invoiceId is provided
3. **Call Extraction API** - Calls PharmaOpsFlow extraction endpoint
4. **Check Needs Review** - Routes based on whether manual review is needed
5. **Notify** - Sends notification if review is needed
6. **Respond** - Returns result to webhook caller

### Integration with File Upload

To automatically trigger extraction when files are uploaded, you can:

1. Use the `autoExtract=true` query parameter when uploading files:
   ```
   POST /invoices/{invoiceId}/files?autoExtract=true
   ```

2. Or configure a webhook in your storage provider (e.g., Supabase) to call this n8n workflow when new files are uploaded.

### Alternative: Direct API Integration

You can also trigger extraction directly via the API without n8n:

```bash
# Trigger extraction
curl -X POST "http://localhost:4000/extraction/invoices/{invoiceId}/extract" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fileId": "optional-file-id"}'

# Get extraction results
curl "http://localhost:4000/extraction/invoices/{invoiceId}/extraction" \
  -H "Authorization: Bearer <token>"

# Apply extraction to invoice
curl -X POST "http://localhost:4000/extraction/invoices/{invoiceId}/apply-extraction" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": "vendor-uuid",
    "invoiceTypeId": "type-uuid",
    "invoiceNumber": "INV-001",
    "invoiceDate": "2024-01-15",
    "dueDate": "2024-02-15",
    "amount": 1500.00
  }'
```
