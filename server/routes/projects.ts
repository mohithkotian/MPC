import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from './auth';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectServiceError,
  updateProject,
  validateOrganizationId,
} from '../services/projectService';

function sendProjectError(res: Response, error: unknown): void {
  if (error instanceof ProjectServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'Unable to process project request' });
}

function organizationId(req: AuthenticatedRequest): string {
  return validateOrganizationId(req.header('x-organization-id'));
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ projects: await listProjects(req.supabase!, req.user!, organizationId(req)) });
  } catch (error) {
    sendProjectError(res, error);
  }
});

projectsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.status(201).json(await createProject(req.supabase!, req.user!, organizationId(req), req.body));
  } catch (error) {
    sendProjectError(res, error);
  }
});

projectsRouter.get('/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getProject(req.supabase!, req.user!, organizationId(req), req.params.projectId));
  } catch (error) {
    sendProjectError(res, error);
  }
});

projectsRouter.patch('/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await updateProject(req.supabase!, req.user!, organizationId(req), req.params.projectId, req.body));
  } catch (error) {
    sendProjectError(res, error);
  }
});

projectsRouter.delete('/:projectId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await deleteProject(req.supabase!, req.user!, organizationId(req), req.params.projectId);
    res.status(204).end();
  } catch (error) {
    sendProjectError(res, error);
  }
});
