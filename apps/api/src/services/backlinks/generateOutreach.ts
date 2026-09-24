import prisma from '../../lib/database';
import { getAiProvider } from '../aiProvider';

export async function generateOutreachMessage(campaignId: string, websiteId: string) {
  const campaign = await prisma.backlinkCampaign.findUnique({
    where: { id: campaignId },
    include: { opportunity: true }
  });

  if (!campaign || campaign.websiteId !== websiteId) {
    throw new Error('Campaign not found');
  }

  const website = await prisma.website.findUnique({
    where: { id: websiteId }
  });

  if (!website) {
    throw new Error('Website not found');
  }

  const ai = getAiProvider();
  
  const systemPrompt = `You are a professional outreach assistant. Your job is to draft a concise, highly professional outreach email for acquiring a backlink or building a relationship.
IMPORTANT RULES:
- Do NOT pretend to know the recipient personally.
- Do NOT claim a relationship that does not exist.
- Do NOT claim the recipient previously agreed to anything.
- Do NOT fabricate facts or make deceptive statements.
- Return a JSON object with "subject" and "message".`;

  const userPrompt = `Draft an outreach email to the owner of ${campaign.opportunity.domain}.
Our website: ${website.name} (Industry: ${website.industry})
Opportunity Type: ${campaign.opportunity.type}
Target URL: ${campaign.opportunity.url || campaign.opportunity.domain}
Suggested Action: ${campaign.opportunity.suggestedAction || 'Ask for a link or collaboration'}
Contact Name (if known): ${campaign.contactName || 'Site Owner/Editor'}`;

  let subject = 'Partnership Opportunity';
  let message = 'Hello,\n\nWe love your content and would like to connect.\n\nBest,';

  try {
    const aiResponse = await ai.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.6,
      maxTokens: 500
    });

    const parsed = JSON.parse(aiResponse);
    if (parsed.subject) subject = parsed.subject;
    if (parsed.message) message = parsed.message;
  } catch (err) {
    console.error('Outreach generation failed:', err);
    throw new Error('Failed to generate outreach message');
  }

  // Update campaign with draft message
  const updated = await prisma.backlinkCampaign.update({
    where: { id: campaignId },
    data: {
      subject,
      message,
      status: campaign.status === 'DRAFT' ? 'READY' : campaign.status
    }
  });

  return updated;
}
