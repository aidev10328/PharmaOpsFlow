# PharmaOpsFlow n8n Workflows

This directory contains n8n workflow configurations for SLA automation.

## Workflows

### 1. sla-daily-evaluation.json
Daily SLA evaluation workflow that runs at 6 AM to check for SLA violations.

**Schedule:** Every day at 6:00 AM
**Actions:**
- Calls POST /v1/sla/run to evaluate SLA compliance
- Checks for submission and processing violations
- Logs results (can be extended to send Slack/Email notifications)

### 2. sla-reminders.json
SLA reminder workflow that sends reminders before deadlines.

**Schedules:**
- 3rd & 4th of month at 9:00 AM - Submission deadline reminders
- 8th & 9th of month at 9:00 AM - Processing deadline reminders

**Actions:**
- Calls POST /v1/sla/reminders/submission or /v1/sla/reminders/processing
- Logs number of reminders sent

## Setup Instructions

### 1. Import Workflows
1. Open n8n dashboard
2. Go to Workflows > Import from File
3. Import each JSON file

### 2. Configure Credentials
Create an HTTP Header Auth credential named "PharmaOpsFlow API Key":
- Header Name: `Authorization`
- Header Value: `Bearer <your-jwt-token>`

For automated workflows, you may want to create a service account user with ADMIN or COMPANY_MANAGER role.

### 3. Set Environment Variables
In n8n, set the following environment variable:
- `PHARMAOPSFLOW_API_URL`: Base URL of the API (e.g., `http://localhost:4000` or `https://api.yourdomain.com`)

### 4. Activate Workflows
1. Open each workflow
2. Click the "Active" toggle in the top-right corner
3. Verify the schedule triggers are correct for your timezone

## Customization

### Adding Slack Notifications
Replace the "Log Result" nodes with Slack nodes:
1. Add a Slack node
2. Configure with your Slack credentials
3. Select channel and message format

### Adding Email Notifications
Replace the "Log Result" nodes with Email nodes:
1. Add an SMTP or SendGrid node
2. Configure email credentials
3. Set recipients and message template

## SLA Configuration

The following environment variables can be set in the API to customize SLA deadlines:

```env
SUBMISSION_DUE_DAY=5      # Day of month for submission deadline
PROCESSING_DUE_DAY=10     # Day of month for processing deadline
ORG_TIMEZONE=America/New_York  # Timezone for deadline calculations
```
