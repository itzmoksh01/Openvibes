import type {JobKind} from '../types.js';
export interface ProviderCapabilities { provider:string; status:'VERIFIED_WORKING'|'BLOCKED'|'UNVERIFIED'|'NOT_SUPPORTED'; imageGeneration:boolean; videoGeneration:boolean; imageToVideo:boolean; freePlan:boolean|'unknown'; unattended:boolean; reason:string; evidenceUrl:string[]; }
export interface CreativeProvider { readonly id:string; getCapabilities():Promise<ProviderCapabilities>; generate(kind:JobKind,input:Record<string,unknown>):Promise<never>; }
