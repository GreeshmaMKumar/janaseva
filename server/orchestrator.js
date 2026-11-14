import {
  intakeAgent,
  classificationAgent,
  priorityAgent,
  routingAgent,
  resolutionAgent,
  monitoringAgent,
} from './agents.js';

export async function processComplaint(complaint) {
  const intake = await intakeAgent(complaint);

  const classification = await classificationAgent({
    complaint,
    intake,
  });

  const priority = await priorityAgent({
    complaint,
    intake,
    classification,
  });

  const routing = await routingAgent({
    complaint,
    classification,
    priority,
    departments: [
      'Road Department',
      'Sanitation Department',
      'Street Lighting Department',
      'Water Supply Department',
      'Drainage Department',
    ],
  });

  const resolution = await resolutionAgent({
    complaint,
    classification,
    priority,
    routing,
  });

  const monitoring = await monitoringAgent({
    complaint,
    priority,
    routing,
    status: 'Awaiting officer approval',
  });

  return {
    intake,
    classification,
    priority,
    routing,
    resolution,
    monitoring,
    status: 'Awaiting officer approval',
  };
}
