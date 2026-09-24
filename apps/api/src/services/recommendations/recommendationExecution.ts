import { PrismaClient, SeoRecommendation, AutomationType } from '@prisma/client';
import { getAiProvider } from '../aiProvider';

const prisma = new PrismaClient();

export async function executeRecommendation(recommendationId: string, websiteId: string) {
  const rec = await prisma.seoRecommendation.findUnique({
    where: { id: recommendationId }
  });

  if (!rec || rec.websiteId !== websiteId) {
    throw new Error('Recommendation not found or access denied');
  }

  if (rec.status === 'COMPLETED' || rec.status === 'DISMISSED') {
    throw new Error('Recommendation is already completed or dismissed');
  }

  const ai = getAiProvider();
  let executed = false;

  switch (rec.type) {
    case 'CREATE_ARTICLE':
      // Automation: Create an Article draft
      if (rec.targetKeyword) {
        await prisma.article.create({
          data: {
            websiteId,
            title: `Draft: ${rec.targetKeyword}`,
            primaryKeyword: rec.targetKeyword,
            topic: rec.title,
            status: 'DRAFT',
            content: '',
          }
        });
        executed = true;
      }
      break;
      
    case 'VERIFY_BACKLINK':
      // Would trigger Trigger.dev job if we had a dedicated job, or just change status.
      // E.g., we could enqueue a background job.
      if (rec.sourceId) {
        await prisma.backgroundJob.create({
          data: {
            type: 'BACKLINK_VERIFICATION',
            payload: { backlinkId: rec.sourceId },
            status: 'QUEUED'
          }
        });
        executed = true;
      }
      break;
      
    case 'START_OUTREACH':
      // Create campaign draft
      if (rec.sourceId) {
        // Assume sourceId is backlinkOpportunityId
        const existingCamp = await prisma.backlinkCampaign.findFirst({
          where: { opportunityId: rec.sourceId }
        });
        if (!existingCamp) {
          await prisma.backlinkCampaign.create({
            data: {
              websiteId,
              opportunityId: rec.sourceId,
              status: 'DRAFT',
              subject: `Collaboration with ${rec.targetUrl || 'your site'}`,
              message: `Hi,\n\nI was browsing your site...`
            }
          });
          executed = true;
        }
      }
      break;

    case 'OPTIMIZE_CONTENT':
      // AI assistance to suggest changes
      // This is LEVEL 2 AI-ASSISTED, would return suggested changes rather than modifying code directly.
      const changes = await ai.generateCompletion({
        systemPrompt: 'You are an SEO assistant.',
        userPrompt: 'Suggest 3 optimizations for ' + (rec.targetUrl || 'this page') + ' focusing on ' + (rec.targetKeyword || 'SEO')
      });
      
      await prisma.seoRecommendation.update({
        where: { id: rec.id },
        data: {
          suggestedAction: changes,
          status: 'IN_PROGRESS'
        }
      });
      return { success: true, message: 'Optimization suggestions generated', data: changes };
      
    case 'FIX_TECHNICAL_ISSUE':
      // safe automatic modification impossible -> clear implementation instruction
      const instructions = await ai.generateCompletion({
        systemPrompt: 'You are an expert SEO developer.',
        userPrompt: 'Write a step-by-step developer guide to fix: ' + rec.description
      });
      
      await prisma.seoRecommendation.update({
        where: { id: rec.id },
        data: {
          suggestedAction: instructions,
          status: 'IN_PROGRESS' // They have instructions to implement
        }
      });
      return { success: true, message: 'Fix instructions generated', data: instructions };
      
    default:
      throw new Error(`Execution for ${rec.type} not implemented automatically.`);
  }

  if (executed) {
    await prisma.seoRecommendation.update({
      where: { id: rec.id },
      data: { status: 'IN_PROGRESS' }
    });
    return { success: true, message: 'Action executed successfully.' };
  }

  throw new Error('Action could not be executed.');
}
