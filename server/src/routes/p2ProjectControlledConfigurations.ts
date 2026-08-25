import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { areP2ProjectControlledConfigurationReadsEnabled, areP2ProjectControlledConfigurationWritesEnabled } from '../lib/featureFlags';
import { createProjectControlledConfiguration, listProjectControlledConfigurations, ProjectConfigurationError, releaseProjectControlledConfiguration } from '../services/p2ProjectControlledConfigurationService';
const router=Router();
const createSchema=z.object({inventoryItemId:z.number().int().positive(),bomRevisionId:z.string().uuid(),routingId:z.string().uuid(),effectivity:z.record(z.unknown()),customerConfiguration:z.record(z.unknown())});
const releaseSchema=z.object({expectedConcurrencyVersion:z.number().int().positive(),signatureMeaning:z.string().trim().min(1).max(1000)});
const enabled=(value:boolean)=>{if(!value) throw new ProjectConfigurationError('FEATURE_DISABLED','Project controlled configuration is disabled.',404);};
async function actor(req:any){const snapshot=await resolveUserSnapshot(req.user.id);return {userId:snapshot.userId,displayName:snapshot.displayName,role:String(req.user.role)};}
function fail(res:any,e:any){if(e instanceof z.ZodError)return res.status(400).json({error:'INVALID_INPUT',details:e.flatten()});if(e instanceof ProjectConfigurationError)return res.status(e.status).json({error:e.code,message:e.message});console.error('[p2-project-controlled-configuration]',e);return res.status(500).json({error:'PROJECT_CONFIGURATION_FAILED'});}
router.get('/projects/:projectId/controlled-configurations',authenticateToken,requirePermission('projects.controlled_configuration.view'),async(req,res)=>{try{enabled(areP2ProjectControlledConfigurationReadsEnabled());res.json({configurations:await listProjectControlledConfigurations(req.params.projectId)});}catch(e){fail(res,e);}});
router.post('/projects/:projectId/controlled-configurations',authenticateToken,requirePermission('projects.controlled_configuration.manage'),async(req,res)=>{try{enabled(areP2ProjectControlledConfigurationWritesEnabled());const body=createSchema.parse(req.body);res.status(201).json(await createProjectControlledConfiguration({...body,projectId:req.params.projectId},await actor(req)));}catch(e){fail(res,e);}});
router.post('/project-controlled-configurations/:id/release',authenticateToken,requirePermission('projects.controlled_configuration.manage'),async(req,res)=>{try{enabled(areP2ProjectControlledConfigurationWritesEnabled());const body=releaseSchema.parse(req.body);res.json(await releaseProjectControlledConfiguration(req.params.id,body.expectedConcurrencyVersion,body.signatureMeaning,await actor(req)));}catch(e){fail(res,e);}});
export default router;
